const express = require('express');
const { CheckAuth } = require('../helpers/osuApiHelper');
const { InspectorPlayerReputation } = require('../helpers/db');
const { Op, literal } = require('@sequelize/core');
const { getFullUsers } = require('../helpers/userHelper');
const router = express.Router();

const VALID_REP_TYPES = ['user'];
// const VALID_REP_TYPES = ['user', 'score', 'beatmap'];
//expects form-data with access_token, user_id, target_id, and type (user, score, beatmap)
router.post('/', async (req, res) => {
    const { token, userId, targetId, type } = req.body;

    if (!token || !userId || !targetId || !type) {
        return res.status(400).json({ error: 'Token, user ID, target ID, and type are required' });
    }

    if (!VALID_REP_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid reputation type' });
    }

    try {
        let auth = await CheckAuth(token, userId);
        if (!auth) {
            return res.status(403).json({ error: 'Invalid access token' });
        }

        //check if both users exist on the osu!api (if type is user, otherwise only user_id)
        const users = await getFullUsers([userId, type === 'user' ? targetId : null].filter(Boolean), true);
        if (!users || users.length < (type === 'user' ? 2 : 1)) {
            return res.status(404).json({ error: 'One or both users not found in osu! API' });
        }

        //check if user_id has already given reputation within the last 24 hours
        const existingRep = await InspectorPlayerReputation.findOne({
            where: {
                user_id: userId,
                target_type: type,
                created_at: {
                    [Op.gte]: literal("DATE_SUB(NOW(), INTERVAL 1 DAY)")
                }
            }
        });
        if (existingRep) {
            return res.status(400).json({ error: 'You have already given reputation within the last 24 hours' });
        }

        //create new reputation entry
        await InspectorPlayerReputation.create({
            user_id: userId,
            target_id: targetId,
            target_type: type
        });

        return res.status(200).json({
            message: 'Reputation given successfully',
        });
    } catch (err) {
        console.error('Error during reputation change:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

router.get('/top/:type', async (req, res) => {
    const { type } = req.params;

    if (!VALID_REP_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid reputation type' });
    }

    try {
        const reputations = await InspectorPlayerReputation.findAll({
            where: {
                target_type: type
            },
            attributes: [
                'target_id',
                [literal('COUNT(*)'), 'rep_count']
            ],
            group: ['target_id'],
            order: [[literal('rep_count'), 'DESC']],
            limit: 10
        });

        //get users
        switch (type) {
            case 'user':
                const userIds = reputations.map(r => r.target_id);
                const users = await getFullUsers(userIds, true);
                const userMap = {};
                users.forEach(user => {
                    if (!user || !user.osuApi) return;
                    userMap[user.osuApi?.id] = user;
                });
                reputations.forEach(rep => {
                    rep.dataValues.user = userMap[rep.target_id] || null;
                    rep.dataValues.rep_count = parseInt(rep.dataValues.rep_count);
                });
                break;
            //for score and beatmap, we could potentially fetch additional info from the database or osu!api if desired
            default:
                break;
        }

        let _reputations = reputations.map(r => r.dataValues);
        //filter out non-users
        if (type === 'user') {
            _reputations = _reputations.filter(r => r.user);
        }

        _reputations.sort((a, b) => b.rep_count - a.rep_count);
        _reputations.splice(5);

        return res.status(200).json({
            targetType: type,
            topReputations: _reputations
        });
    }
    catch (error) {
        console.error('Error during top reputation retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/user/:targetId', async (req, res) => {
    const { targetId } = req.params;

    try {
        const reputation_given = await InspectorPlayerReputation.findAll({
            where: {
                target_type: 'user',
                user_id: targetId
            },
        });

        const reputation_received = await InspectorPlayerReputation.findAll({
            where: {
                target_type: 'user',
                target_id: targetId
            },
        });

        return res.status(200).json({
            user: targetId,
            reputation_given: reputation_given.map(r => r.dataValues),
            reputation_received: reputation_received.map(r => r.dataValues)
        });

    } catch (error) {
        console.error('Error during reputation retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;