const express = require('express');
const { CheckAuth } = require('../helpers/osuApiHelper');
const { Op, literal } = require('@sequelize/core');
const { getFullUsers } = require('../helpers/userHelper');
const { InspectorPlayerVisitor } = require('../helpers/db');
const router = express.Router();

const LIMIT_PER_USER_PER_MINUTES = [5, 30]; // [max visits, minutes]
let limiter_cache = {}; // { 'userId': [timestamps] } auto remove those over 30 mins old
router.post('/', async (req, res) => {
    const { token, userId, targetId } = req.body;

    if (!userId || !targetId) {
        return res.status(400).json({ error: 'User ID and target ID are required' });
    }

    if(userId === targetId) {
        return res.status(400).json({ error: 'You cannot register a visit to your own profile' });
    }

    if (!token && userId !== -1) {
        return res.status(400).json({ error: 'Access token is required for registered users' });
    }

    //perform limit cleanup for all users
    const now = Date.now();
    for (const [uid, timestamps] of Object.entries(limiter_cache)) {
        limiter_cache[uid] = timestamps.filter(ts => now - ts < LIMIT_PER_USER_PER_MINUTES[1] * 60 * 1000);
        if (limiter_cache[uid].length === 0) {
            delete limiter_cache[uid];
        }
    }

    //check if user has exceeded the limit
    if (limiter_cache[userId] && limiter_cache[userId].length >= LIMIT_PER_USER_PER_MINUTES[0]) {
        return res.status(429).json({ error: `You can only register ${LIMIT_PER_USER_PER_MINUTES[0]} visits every ${LIMIT_PER_USER_PER_MINUTES[1]} minutes` });
    }

    try {
        if(userId !== -1){
            //token check so someone cannot visit a profile in another user's name
            let auth = await CheckAuth(token, userId);
            if (!auth) {
                return res.status(403).json({ error: 'Invalid access token' });
            }
        }else{
            //-1 are guests
            //no token check
        }

        //check if both users exist on the osu!api
        const users = await getFullUsers([userId !== -1 ? userId : null, targetId], true);
        if (!users || users.length < (userId !== -1 ? 2 : 1)) {
            return res.status(404).json({ error: 'One or both users not found in osu! API' });
        }

        //if there's an entry from the last 30 minutes, update the timestamp
        //essentially limiting it to 1 unique visit per 30 minutes
        const existingVisit = await InspectorPlayerVisitor.findOne({
            where: {
                user_id: userId,
                target_id: targetId,
                created_at: {
                    [Op.gte]: literal("DATE_SUB(NOW(), INTERVAL 30 MINUTE)")
                }
            }
        });
        if (existingVisit) {
            existingVisit.updated_at = new Date();
            await existingVisit.save();
        } else {
            await InspectorPlayerVisitor.create({
                user_id: userId,
                target_id: targetId
            });
        }

        //add to cache
        if (!limiter_cache[userId]) {
            limiter_cache[userId] = [];
        }
        limiter_cache[userId].push(Date.now());

        return res.status(200).json({
            message: 'Visit recorded successfully',
        });
    } catch (err) {
        console.error('Error during visitor update:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/recent', async (req, res) => {
    //get last visited users globally, unique
    try {
        const recentVisitors = await InspectorPlayerVisitor.findAll({
            attributes: ['target_id', [literal('MAX(updated_at)'), 'last_visited']],
            group: ['target_id'],
            order: [[literal('last_visited'), 'DESC']],
            limit: 20 //leeway for banned users even if the chance is 0
        });
        const targetIds = recentVisitors.map(v => v.target_id);
        const users = await getFullUsers(targetIds, true);
        const userMap = {};
        users.forEach(u => {
            if(!u.osuApi) return;
            userMap[u.osuApi?.id] = u;
        });
        let result = recentVisitors.map(v => ({
            target_id: v.target_id,
            last_visited: v.dataValues.last_visited,
            user: userMap[v.target_id] || null
        }));
        //filter out entries where user is null (not found in osu!api)
        result = result.filter(r => r.user !== null);
        result = result.sort((a, b) => new Date(b.last_visited) - new Date(a.last_visited)); //sort by last visited desc
        result = result.slice(0, 10); //limit to 10 entries
        return res.status(200).json(result);
    }
    catch (err) {
        console.error('Error fetching recent visitors:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;