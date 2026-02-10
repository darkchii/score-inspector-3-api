const express = require('express');
const router = express.Router();
const apicache = require('apicache-plus');
const { Databases, CheckConnection } = require('../helpers/db');

router.get('/info', apicache('1 hour') ,async (req, res) => {
    try {
        const ver = process.env.npm_package_version || 'unknown';
        const altDbAccessable = Databases.osuAlt ? await CheckConnection(Databases.osuAlt) : false;
        return res.status(200).json({ version: ver, altDbAccessable: altDbAccessable });
    } catch (error) {
        console.error('Error fetching all packs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
