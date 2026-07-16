const { InspectorActivityLog } = require("./db");

const LOG_ACTIVITY_TYPES = [
    'UPDATE_BEATMAPSET_MEDIA',
    'UPDATE_TEAM_DATA',
];

//only these keys can be present in the log data object
//all optional, if empty it just doesn't log anything
const LOG_KEYS = [
    'user_id',
    'username',
    'team_id',
    'team_name',
    'team_short',
    'beatmapset_id',
    'beatmapset_title',
    'beatmapset_artist',
    'data', //any extra data (like delta changes)
    'type', //LOG_ACTIVITY_TYPES
]

async function logActivity(data) {
    if(!data?.type){
        console.error('logActivity: Missing type in data');
        return;
    }

    if(!LOG_ACTIVITY_TYPES.includes(data.type)){
        console.error(`logActivity: Invalid type '${data.type}' in data`);
        return;
    }

    //strict check for keys, if any key is not in LOG_KEYS, it will throw an error
    const invalidKeys = Object.keys(data).filter(key => !LOG_KEYS.includes(key));
    if(invalidKeys.length > 0){
        console.error(`logActivity: Invalid keys in data: ${invalidKeys.join(', ')}`);
        return;
    }

    //insert into InspectorActivityLog
    //we basically only insert 'data' column, the others are ID and created_at which are auto-generated
    try {
        await InspectorActivityLog.create({
            data: data,
        });
    } catch (error) {
        console.error('logActivity: Failed to insert log into database', error);
    }
}

module.exports = {
    logActivity
};