const express = require('express');
const { Search, GetUserData, GetUsers, CheckAuth } = require('../helpers/osuApiHelper');
const { AltUserLive, CheckConnection, Databases, AltScoreLive, Team, AltRegistration, InspectorCompletionist, InspectorUserRole, InspectorRole, InspectorPlayerReputation } = require('../helpers/db');
const apicache = require('apicache-plus');
const { default: Sequelize, Op, literal } = require('@sequelize/core');
const { getFullUsers } = require('../helpers/userHelper');
const router = express.Router();

router.get('/search/:query', async (req, res) => {
    const { query } = req.params;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    if (query.length < 2) {
        return res.status(400).json({ error: 'Query parameter must be at least 2 characters long' });
    }

    //lowercase search
    let _query = query.toLowerCase();

    try {
        const users = await AltUserLive.findAll({
            where: {
                username: {
                    [Op.iLike]: `%${_query}%`
                }
            },
            order: [
                //Order by relevance heuristic
                [literal(`CASE
                    WHEN LOWER(username) = '${_query}' THEN 1
                    WHEN LOWER(username) LIKE '${_query}%' THEN 2
                    WHEN LOWER(username) LIKE '%${_query}' THEN 3
                    ELSE 4
                END`), 'ASC'],
                ['username', 'ASC']
            ],
            limit: 20
        });

        if (users.length === 0) {
            return res.status(404).json({ error: 'No users found matching the query' });
        }

        let _users = await getFullUsers(users.map(u => u.user_id), true);

        return res.status(200).json(_users);
    } catch (error) {
        console.error('Error during user search:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/:userId/profile', apicache('1 hour'), async (req, res) => {
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
        const userLive = await AltUserLive.findOne({ where: { user_id: userId } });

        if (!userLive) {
            return res.status(404).json({ error: 'User not found in osu!alternative' });
        }

        const users = await getFullUsers([parseInt(userId)], true);

        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'User not found in osu!api' });
        }

        return res.status(200).json(users[0]);
    } catch (error) {
        console.error('Error during user profile retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/:userId/scores', apicache('1 hour'), async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID parameter is required' });
    }

    //validate that userId is a number
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'User ID must be a number' });
    }

    try {
        const scores = await AltScoreLive.findAll({ where: { user_id: userId } });
        if (scores && scores.length > 0) {
            return res.status(200).json(scores);
        } else {
            return res.status(404).json({ error: 'No scores found for this user' });
        }
    } catch (error) {
        console.error('Error during user scores retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/completionists', apicache('1 hour'), async (req, res) => {
    try {
        const completionists = await InspectorCompletionist.findAll();
        // let users = await GetUsers(completionists.map(c => c.user_id));
        let users = await getFullUsers(completionists.map(c => c.user_id), true);

        let remapped = [];
        for (const completionist of completionists) {
            const userData = users.find(u => u.osuApi.id === completionist.user_id);
            remapped.push({
                ...completionist.dataValues,
                user: userData || null
            });
        }

        return res.status(200).json(remapped);
    } catch (error) {
        console.error('Error during completionists retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/people', apicache('2 hours'), async (req, res) => {
    //find all users that have a role
    try {
        //get all userroles
        const userRoles = await InspectorUserRole.findAll();
        const roles = await InspectorRole.findAll();
        let users = await getFullUsers(userRoles.map(ur => ur.user_id), true);
        if (users && users.length > 0 && roles && roles.length > 0) {
            return res.status(200).json({
                users: users,
                roles: roles
            });
        } else {
            return res.status(404).json({ error: 'No users found with roles' });
        }
    } catch (error) {
        console.error('Error during people retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/reputation', async (req, res) => {
    const { access_token, user_id, target_user_id } = req.body;

    try{
        //validate access first
        try{
            CheckAuth(access_token, user_id); //will throw if invalid
        }catch(err){
            return res.status(403).json({ error: 'Invalid access token' });
        }

        //check if both users exist on the osu!api
        const users = await getFullUsers([user_id, target_user_id], true);
        if (!users || users.length < 2) {
            return res.status(404).json({ error: 'One or both users not found in osu! API' });
        }

        //check if user_id has already given reputation within the last 24 hours
        const existingRep = await InspectorPlayerReputation.findOne({
            where: {
                user_id: user_id,
                created_at: {
                    [Op.gte]: Sequelize.literal("NOW() - INTERVAL '24 HOURS'")
                }
            }
        });
        if (existingRep) {
            return res.status(400).json({ error: 'You have already given reputation within the last 24 hours' });
        }

        //create new reputation entry
        await InspectorPlayerReputation.create({
            user_id: user_id,
            target_id: target_user_id
        });

        return res.status(200).json({ message: 'Reputation given successfully' });
    }catch(err){
        console.error('Error during reputation change:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})
module.exports = router;
