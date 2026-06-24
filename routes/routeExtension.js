//extension specific api endpoints
const express = require('express');
const { AltUserLive, AltUserStat, getScoreRankModelByRuleset, InspectorCompletionist, InspectorTeam, InspectorBeatmapMedia } = require('../helpers/db');
const { Op } = require('@sequelize/core');
const router = express.Router();

router.get('/', (req, res) => {
    res.status(200).json({ message: 'Alya Kujou' });
});

router.post('/profile', async (req, res) => {
    const { user_id, mode } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id parameter is required' });
    }

    try {
        const rulesetIndex = mode;
        if (rulesetIndex < 0 || rulesetIndex > 3) {
            return res.status(400).json({ error: 'Invalid mode parameter' });
        }

        const userLive = await AltUserLive.findOne({ where: { user_id: user_id } });

        if (!userLive) {
            //return empty, but not error
            return res.status(200).json({ user: null, scoreRankHistory: [], completion: 0, ruleset: rulesetIndex, completionist: [] });
        }

        const completionData = await AltUserStat.findOne({ where: { user_id: user_id, metric_type: 'plays', mode_bucket: rulesetIndex, fa_bucket: 2, diff_bucket: 2 } });
        const completion = completionData ? 100 / completionData.total * completionData.value : 0;

        const scoreRankData = await getScoreRankModelByRuleset(rulesetIndex).findAll({
            where: {
                [Op.and]: [
                    { user_id: user_id },
                    { date: { [Op.gte]: new Date(new Date() - 90 * 24 * 60 * 60 * 1000) } }
                ]
            },
            order: [
                ['date', 'ASC']
            ],
        });

        const completionistData = await InspectorCompletionist.findAll({
            where: {
                user_id: user_id
            }
        })

        let user = userLive.get({ plain: true });
        user.completion = completion;

        const profileData = {
            user: user,
            scoreRankHistory: scoreRankData?.map(data => data.get({ plain: true })) ?? [],
            ruleset: rulesetIndex,
            completion: completionistData?.map(data => data.get({ plain: true })) ?? []
        };
        return res.status(200).json(profileData);
    } catch (error) {
        console.error('Error during profile retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/teamData', async (req, res) => {
    //expects: array of team IDs. This endpoint only returns extra team data, not osu!api data
    const { teamIds } = req.body;
    if (!teamIds || !Array.isArray(teamIds)) {
        return res.status(400).json({ error: 'teamIds parameter is required and must be an array' });
    }

    try {
        const teamsData = await InspectorTeam.findAll({
            where: {
                id: teamIds
            }
        });
        const teamsDataById = {};
        teamsData.forEach(team => {
            teamsDataById[team.id] = team.get({ plain: true });
        });
        return res.status(200).json(teamsDataById);
    } catch (error) {
        console.error('Error during team data retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/beatmapMedia/:beatmapset_id', async (req, res) => {
    const { beatmapset_id } = req.params;
    if (!beatmapset_id) {
        return res.status(400).json({ error: 'beatmapset_id parameter is required' });
    }
    try {
        const beatmapMedia = await InspectorBeatmapMedia.findOne({ where: { beatmapset_id: beatmapset_id } });
        return res.status(beatmapMedia ? 200 : 404).json(beatmapMedia?.get({ plain: true }) ?? null);
    } catch (error) {
        console.error('Error during beatmap media retrieval:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/score_rank_history/:mode', async (req, res) => {
    try {
        const mode = req.params.mode;
        const user_ids = req.body.user_ids;

        //for each ID, get the oldest date, max 35 days old
        const scoreRankHistory = await getScoreRankModelByRuleset(mode).findAll({
            where: {
                [Op.and]: [
                    { user_id: user_ids },
                    { date: { [Op.gte]: new Date(new Date() - 31 * 24 * 60 * 60 * 1000) } }
                ]
            },
            order: [
                ['date', 'ASC']
            ],
        });

        //for each user, get the oldest entry
        let _scoreRankHistory = {};
        scoreRankHistory.forEach(entry => {
            if (!_scoreRankHistory[entry.user_id]) {
                _scoreRankHistory[entry.user_id] = entry;
            } else {
                if (entry.date < _scoreRankHistory[entry.user_id].date) {
                    _scoreRankHistory[entry.user_id] = entry;
                }
            }
        });

        //convert to array, we dont need the keys
        const _scoreRankHistoryArray = Object.values(_scoreRankHistory);

        res.json(_scoreRankHistoryArray);
    } catch (err) {
        res.status(500).json({ error: 'Unable to get data', message: err.message });
    }
});

module.exports = router;
