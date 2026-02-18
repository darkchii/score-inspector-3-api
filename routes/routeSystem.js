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

const realm_cache = multer({ storage: multer.memoryStorage() });
const realm_version = 51; // Version as of 2026-02-15, should always match what live osu!lazer has
let IP_CACHE = {}; //limit to one IP per minute, this is a fairly heavy task
router.post('/process-realm', realm_cache.single('realmFile'), async (req, res) => {
    const clientIp = req.ip;
    const now = Date.now();
    if (IP_CACHE[clientIp] && (now - IP_CACHE[clientIp] < 60 * 1000)) { //10 mins for testing
        return res.status(429).json({ error: 'Too many requests, please wait a minute before trying again' });
    }
    IP_CACHE[clientIp] = now;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const tempFilePath = path.join(
        os.tmpdir(),
        crypto.randomUUID() + ".realm"
    );

    try {
        await fs.writeFile(tempFilePath, req.file.buffer);

        const realm = await Realm.open({
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
        const result = Array.from(objects);
        const clonedResult = JSON.parse(JSON.stringify(result)); //Otherwise the data will be lost when realm is closed and error out
        realm.close();
        res.json({
            beatmapSets: clonedResult,
            version: realm_version
        });
    } catch (err) {
        console.error('Error processing realm file:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        try {
            await fs.unlink(tempFilePath);
        } catch { }
    }
});

module.exports = router;
