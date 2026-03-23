const express = require('express');
const { AuthorizeCodeGrant, GetOwnData } = require('../helpers/osuApiHelper');
const { getFullUsers } = require('../helpers/userHelper');
const { InspectorPlayerReputation } = require('../helpers/db');
const { fn, col } = require('@sequelize/core');
const router = express.Router();

router.post('/login', async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Code is required' });
    }

    try{
        const response = await AuthorizeCodeGrant(code, 'authorization_code');
        if (response && response.access_token) {
            return res.status(200).json({
                access_token: response.access_token,
                refresh_token: response.refresh_token || null,
                expires_in: response.expires_in || 3600,
                token_type: response.token_type || 'Bearer',
                user_id: response.user_id
            });
        } else {
            return res.status(400).json({ error: 'Invalid response from osu! API' });
        }
    }catch(error){
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token is required' });
    }

    try{
        const response = await AuthorizeCodeGrant(refresh_token, 'refresh_token');
        if (response && response.access_token) {
            return res.status(200).json({
                access_token: response.access_token,
                refresh_token: response.refresh_token || null,
                expires_in: response.expires_in || 3600,
                token_type: response.token_type || 'Bearer',
                user_id: response.user_id
            });
        } else {
            return res.status(400).json({ error: 'Invalid response from osu! API' });
        }
    }catch(error){
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/me', async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
        return res.status(400).json({ error: 'Access token is required' });
    }

    try {
        const response = await GetOwnData(access_token);
        if (response && response.id) {
            const data = await getFullUsers([response.id]);
            if (data && data.length > 0) {
                //get the most recent reputation entry for this user, per type
                const reputations = await InspectorPlayerReputation.findAll({
                    //only need the most recent date, nothing else
                    attributes: ['target_type', [fn('MAX', col('created_at')), 'latest_reputation_date']],
                    group: ['target_type'],
                    where: {
                        target_type: 'user',
                        user_id: response.id
                    },
                    order: [['created_at', 'DESC']]
                });

                const reputationMap = {};
                reputations.forEach(r => {
                    reputationMap[r.dataValues.target_type] = r.dataValues.latest_reputation_date;
                });

                data[0].reputation = reputationMap;

                return res.status(200).json(data[0]);
            } else {
                return res.status(400).json({ error: 'User not found in database' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid user data received from osu! API' });
        }
    } catch (error) {
        console.error('Error fetching user data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
