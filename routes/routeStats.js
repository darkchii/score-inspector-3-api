const express = require('express');
const { InspectorStat } = require('../helpers/db');
const { getFullUsers } = require('../helpers/userHelper');
const { OSU_SLUGS } = require('../helpers/osuHelper');
const router = express.Router();

router.get('/top-day', async (req, res) => {
    // Today's top plays (most cleared today, most ss'ed today, etc.)
    try {
        const data = await InspectorStat.findOne({ where: { metric: 'today_top_players' } });


        if (!data || !data.data) {
            throw new Error('No data found');
        }

        const last_updated = data.last_updated;
        const _data = JSON.parse(data.data);

        const userIds = new Set();
        for (const period of ['today', 'yesterday']) {
            if (!_data[period]) continue;
            for (const rulesetId in _data[period]) {
                for (const type in _data[period][rulesetId]) {
                    for (const entry of _data[period][rulesetId][type]) {
                        userIds.add(entry.user_id);
                    }
                }
            }
        }
        console.log(`Found ${userIds.size} unique user IDs in top day stats.`);
        const userIdArray = Array.from(userIds);

        const userData = await getFullUsers(userIdArray);
        const userDataMap = {};
        for (const user of userData) {
            userDataMap[user.osuApi?.id || user.osuAlternative?.user_id] = user;
        }

        //attach user data
        for (const period of ['today', 'yesterday']) {
            if (!_data[period]) continue;
            for (const rulesetId in _data[period]) {
                for (const type in _data[period][rulesetId]) {
                    for (const entry of _data[period][rulesetId][type]) {
                        entry.user = userDataMap[entry.user_id] || null;
                    }
                }
            }
        }

        res.json({
            data: _data,
            last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/global-stats', async (req, res) => {
    try {
        //get: beatmap_counts, score_counts, user_counts, team_counts
        const data = await InspectorStat.findAll({
            where: {
                metric: [
                    'beatmap_counts',
                    'score_counts',
                    'user_counts',
                    'team_counts'
                ]
            }
        })

        const result = {};
        data.forEach(stat => {
            if (stat.data) {
                result[stat.metric] = {
                    data: JSON.parse(stat.data),
                    last_updated: stat.last_updated
                };
            }
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/score-submissions/:ruleset', async (req, res) => {
    const { ruleset } = req.params;
    try {
        if (!Object.keys(OSU_SLUGS).includes(ruleset)) {
            return res.status(400).json({ error: 'Invalid ruleset' });
        }

        const ruleset_id = OSU_SLUGS[ruleset];
        const data = await InspectorStat.findOne({ where: { metric: `score_data_counts_ruleset_${ruleset_id}` } });
        if (!data || !data.data) {
            return res.status(404).json({ error: 'No data found' });
        }

        res.json({
            data: JSON.parse(data.data),
            last_updated: data.last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/active-users', async (req, res) => {
    try {
        const data = await InspectorStat.findOne({ where: { metric: 'active_users' } });
        if (!data || !data.data) {
            return res.status(404).json({ error: 'No data found' });
        }
        res.json({
            data: JSON.parse(data.data),
            last_updated: data.last_updated
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
