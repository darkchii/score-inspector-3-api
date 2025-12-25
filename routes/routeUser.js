const express = require('express');
const { Search, GetUserData, GetUsers } = require('../helpers/osuApiHelper');
const { AltUserLive, CheckConnection, Databases, AltScoreLive, Team, AltRegistration, InspectorCompletionist } = require('../helpers/db');
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
        let users = await GetUsers(completionists.map(c => c.osu_id));

        let teams = await Team.findAll({
            where: {
                id: users.filter(u => u.team).map(u => u.team.id),
                deleted: false
            }
        })

        let remapped = [];
        for (const completionist of completionists) {
            const userData = users.find(u => u.id === completionist.osu_id);
            const teamData = teams.find(t => t.id === userData?.team?.id);
            remapped.push({
                ...completionist.dataValues,
                user: userData || null,
                team: teamData || null
            });
        }

        return res.status(200).json(remapped);
    } catch (error) {
        console.error('Error during completionists retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
