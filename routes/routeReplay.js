const express = require('express');
const { GetReplay } = require('../helpers/osuApiHelper');
const apicache = require('apicache-plus');
const router = express.Router();

router.get('/:scoreId', apicache('24 hours'), async (req, res) => {
    const { scoreId } = req.params;

    //returns octet-stream

    if (!scoreId) {
        return res.status(400).json({ error: 'Score ID parameter is required' });
    }

    try {
        const response = await GetReplay(req.params.scoreId);
        if (response) {
            return res.status(200).json(response);
        } else {
            return res.status(404).json({ error: 'No replay found' });
        }
    } catch (error) {
        console.error('Error during getting replay data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
