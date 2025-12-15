const express = require('express');
const { Search } = require('../helpers/osuApiHelper');
const { AltUserLive, CheckConnection, Databases, AltScoreLive } = require('../helpers/db');
const router = express.Router();

router.get('/:scoreId', async (req, res) => {
    const { scoreId } = req.params;
    if (!scoreId) {
        return res.status(400).json({ error: 'Score ID parameter is required' });
    }

    //validate that scoreId is a number
    if (isNaN(scoreId)) {
        return res.status(400).json({ error: 'Score ID must be a number' });
    }

    try {
        const score = await AltScoreLive.findOne({ where: { id: scoreId } });
        if (score) {
            return res.status(200).json(score);
        } else {
            return res.status(404).json({ error: 'No score found for this score ID' });
        }
    } catch (error) {
        console.error('Error during score retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
