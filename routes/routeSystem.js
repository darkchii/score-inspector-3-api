const express = require('express');
const router = express.Router();
const apicache = require('apicache-plus');
const { Databases, CheckConnection, InspectorNotification } = require('../helpers/db');
const { Realm } = require('realm');
const multer = require('multer');
const os = require("os");
const path = require('path');
const crypto = require('crypto');
const fs = require("fs/promises");

const REALM_TEMP_DIR = path.join(os.tmpdir(), 'score-inspector-realm');
const REALM_MAX_FILE_SIZE_BYTES = parseInt(process.env.REALM_MAX_FILE_SIZE_BYTES || `${1024 * 1024 * 1024}`, 10); // 1GB default
const REALM_STALE_FILE_TTL_MS = parseInt(process.env.REALM_STALE_FILE_TTL_MS || `${24 * 60 * 60 * 1000}`, 10); // 24h default
const REALM_MAX_CONCURRENT_JOBS = parseInt(process.env.REALM_MAX_CONCURRENT_JOBS || '2', 10);
const REALM_UNLINK_RETRIES = 5;
const REALM_UNLINK_RETRY_DELAY_MS = 250;
let ACTIVE_REALM_JOBS = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeUnlink(filePath) {
    if (!filePath) return;

    for (let i = 0; i < REALM_UNLINK_RETRIES; i++) {
        try {
            await fs.unlink(filePath);
            return;
        } catch (err) {
            if (err?.code === 'ENOENT') {
                return;
            }

            const retryable = err?.code === 'EBUSY' || err?.code === 'EPERM';
            const hasRetriesLeft = i < REALM_UNLINK_RETRIES - 1;

            if (!retryable || !hasRetriesLeft) {
                throw err;
            }

            await sleep(REALM_UNLINK_RETRY_DELAY_MS * (i + 1));
        }
    }
}

async function ensureRealmTempDir() {
    await fs.mkdir(REALM_TEMP_DIR, { recursive: true });
}

async function cleanupStaleRealmFiles() {
    const now = Date.now();
    await ensureRealmTempDir();

    const entries = await fs.readdir(REALM_TEMP_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.realm') {
            continue;
        }

        const filePath = path.join(REALM_TEMP_DIR, entry.name);
        try {
            const stat = await fs.stat(filePath);
            if (now - stat.mtimeMs > REALM_STALE_FILE_TTL_MS) {
                await safeUnlink(filePath);
            }
        } catch (err) {
            if (err?.code !== 'ENOENT') {
                console.error('Error while cleaning stale realm file:', err);
            }
        }
    }
}

const realmUpload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                await ensureRealmTempDir();
                cb(null, REALM_TEMP_DIR);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            cb(null, `${crypto.randomUUID()}.realm`);
        }
    }),
    limits: {
        files: 1,
        fileSize: REALM_MAX_FILE_SIZE_BYTES,
    },
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname || '').toLowerCase() !== '.realm') {
            return cb(new Error('Invalid file type, only .realm files are accepted'));
        }
        cb(null, true);
    }
});

function realmUploadMiddleware(req, res, next) {
    realmUpload.single('realmFile')(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'Uploaded file is too large' });
            }
            return res.status(400).json({ error: 'Invalid upload request' });
        }

        return res.status(400).json({ error: err.message || 'Invalid upload request' });
    });
}

ensureRealmTempDir()
    .then(() => cleanupStaleRealmFiles())
    .catch((err) => console.error('Failed to initialize realm temp directory:', err));

setInterval(() => {
    cleanupStaleRealmFiles().catch((err) => {
        console.error('Failed to cleanup stale realm files:', err);
    });
}, 60 * 60 * 1000).unref();

router.get('/info', apicache('1 hour'), async (req, res) => {
    try {
        const ver = process.env.npm_package_version || 'unknown';
        const altDbAccessable = Databases.osuAlt ? await CheckConnection(Databases.osuAlt) : false;
        return res.status(200).json({ version: ver, altDbAccessable: altDbAccessable });
    } catch (error) {
        console.error('Error fetching all packs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/alerts', async (req, res) => {
    try {
        const notifications = await InspectorNotification.findAll({
            where: {
                enabled: true
            },
            order: [['created_at', 'DESC']]
        });
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

const realm_version = 51; // Version as of 2026-02-15, should always match what live osu!lazer has
let IP_CACHE = {}; //limit to one IP per minute, this is a fairly heavy task
let IP_CACHE_TIMEOUT = 60 * 1000; //1 minute
router.post('/process-realm', realmUploadMiddleware, async (req, res) => {
    const clientIp = req.ip;
    const now = Date.now();
    if (IP_CACHE[clientIp] && (now - IP_CACHE[clientIp] < IP_CACHE_TIMEOUT)) { //10 mins for testing
        return res.status(429).json({ error: 'Too many requests, please wait a minute before trying again' });
    }
    IP_CACHE[clientIp] = now;

    //remove old cache entries
    for (const ip in IP_CACHE) {
        if (now - IP_CACHE[ip] > IP_CACHE_TIMEOUT) {
            delete IP_CACHE[ip];
        }
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    if (ACTIVE_REALM_JOBS >= REALM_MAX_CONCURRENT_JOBS) {
        return res.status(429).json({ error: 'Server is busy processing realm files, please retry shortly' });
    }

    ACTIVE_REALM_JOBS += 1;

    const tempFilePath = req.file.path;
    let realm = null;

    try {
        realm = await Realm.open({
            path: tempFilePath,
            schema: [
                {
                    name: "BeatmapSet",
                    primaryKey: "ID",
                    properties: {
                        ID: "uuid",
                        OnlineID: {
                            type: "int",
                            indexed: true,
                            default: -1
                        },
                        Status: "int",
                        Beatmaps: "Beatmap[]",
                    }
                },
                {
                    name: "Beatmap",
                    primaryKey: "ID",
                    properties: {
                        ID: "uuid",
                        OnlineID: "int",
                        Status: "int",
                        MD5Hash: "string?",
                        OnlineMD5Hash: "string?",
                    }
                }
            ],
            schemaVersion: realm_version, // Version as of 2026-02-15
            readOnly: true,
        });

        //Fetch all of them, the client will check for mismatched status for example, so the user can update those maps
        const objects = realm.objects("BeatmapSet");
        const result = Array.from(objects); //required
        const clonedResult = JSON.parse(JSON.stringify(result)); //Otherwise the data will be lost when realm is closed and error out
        realm.close();
        realm = null;
        res.json({
            beatmapSets: clonedResult,
            version: realm_version
        });
    } catch (err) {
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (ACTIVE_REALM_JOBS > 0) {
            ACTIVE_REALM_JOBS -= 1;
        }

        try {
            if (realm) {
                realm.close();
            }
        } catch (closeErr) {
            console.error('Error closing realm instance:', closeErr);
        }

        try {
            await safeUnlink(tempFilePath);
        } catch (unlinkErr) {
            console.error('Error removing temp realm file:', unlinkErr);
        }
    }
});

module.exports = router;
