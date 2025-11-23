const express = require('express');
const { AuthorizeCodeGrant, GetOwnData, Search } = require('../helpers/osuApiHelper');
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

module.exports = router;
