const express = require('express');
const router = express.Router();
const apicache = require('apicache-plus');

router.get('/version', apicache('1 hour') ,async (req, res) => {
    try {
        const ver = process.env.npm_package_version || 'unknown';
        return res.status(200).json(ver);
    } catch (error) {
        console.error('Error fetching all packs:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
