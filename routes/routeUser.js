const express = require('express');
const { Search } = require('../helpers/osuApiHelper');
const { AltUserLive, CheckConnection, Databases } = require('../helpers/db');
const router = express.Router();

router.get('/search', async (req, res) => {
    const { query, page } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const response = await Search('user', query, page || 1);
        if (response) {
            return res.status(200).json(response);
        } else {
            return res.status(404).json({ error: 'No users found' });
        }
    } catch (error) {
        console.error('Error during user search:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:userId/profile', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID parameter is required' });
    }

    //validate that userId is a number
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'User ID must be a number' });
    }

    try {
        //check connection
        const user = await AltUserLive.findOne({ where: { user_id: userId } });
        if (user) {
            return res.status(200).json(user);
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    }catch(error){
        console.error('Error during user profile retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    return res.status(501).json({ error: 'Not implemented yet' });
})

router.get('/:userId/scores', async (req, res) => {
    // TODO: Implement user scores retrieval
    return res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
