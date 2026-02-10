const { default: axios } = require('axios');
const osr = require('node-osr');

require('dotenv').config();

const DEFAULT_API_VERSION = 20240529;

let _local_oauth_login = {
    current_token: null,
    expiration_date: null
}

function getOsuClientID() {
    if (process.env.NODE_ENV === 'development') {
        return process.env.OSU_CLIENT_ID_DEV;
    }
    return process.env.OSU_CLIENT_ID;
}

function getOsuClientSecret() {
    if (process.env.NODE_ENV === 'development') {
        return process.env.OSU_CLIENT_SECRET_DEV;
    }
    return process.env.OSU_CLIENT_SECRET;
}

function getOsuClientRedirectURI() {
    if (process.env.NODE_ENV === 'development') {
        return process.env.OSU_CLIENT_REDIRECT_DEV;
    }
    return process.env.OSU_CLIENT_REDIRECT;
}

async function ClientLogin() {
    const data = {
        client_id: getOsuClientID(),
        client_secret: getOsuClientSecret(),
        grant_type: 'client_credentials',
        scope: 'public'
    };

    try {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', data, {
            headers: {
                "Accept-Encoding": "gzip,deflate,compress"
            }
        });

        if (response.status === 200 && response.data) {
            const expiresIn = response.data.expires_in || 3600; // Default to 1 hour if not provided
            _local_oauth_login.current_token = response.data.access_token;
            _local_oauth_login.expiration_date = new Date(Date.now() + expiresIn * 1000); // Convert seconds to milliseconds
            return _local_oauth_login.current_token;
        } else {
            throw new Error('Failed to retrieve access token');
        }
    } catch (error) {
        console.error('Error during client login:', error);
        throw new Error('Failed to login to osu! API');
    }
}

async function AuthorizedApiCall(url, headers, timeout = 10000, post_body = null, response_type = null) {
    try {
        const config = {
            method: 'get',
            url: url,
            headers: headers,
            timeout: timeout
        };

        if (post_body) {
            config.method = 'post';
            config.data = post_body;
        }

        const response = await axios({...config, responseType: response_type || 'json' });

        if (response.status === 200) {
            return response.data;
        } else {
            throw new Error(`API call failed with status code ${response.status}`);
        }
    } catch (error) {
        console.error('Error during authorized API call:', error);
        throw new Error('Failed to make authorized API call');
    }
}

async function AuthorizedClientApiCall(url, type = 'get', api_version = null, timeout = 10000, post_body = null, content_type = 'application/json', response_type = null) {
    if (!_local_oauth_login.current_token || new Date() >= _local_oauth_login.expiration_date) {
        await ClientLogin();
    }

    const headers = {
        'Content-Type': content_type,
        'Accept': 'application/json',
        'Authorization': `Bearer ${_local_oauth_login.current_token}`,
        'Accept-Encoding': 'gzip, deflate, compress',
        'x-api-version': api_version || DEFAULT_API_VERSION
    }

    const res = await AuthorizedApiCall(url, headers, timeout, post_body, response_type);
    return res;
}

async function AuthorizedResourceOwnerApiCall(url, access_token, type = 'get', api_version = null, timeout = 10000, post_body = null) {
    // No validation here. Website visits will validate (and refresh) the token
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${access_token}`,
        'Accept-Encoding': 'gzip, deflate, compress',
        'x-api-version': api_version || DEFAULT_API_VERSION
    }

    const res = await AuthorizedApiCall(url, headers, timeout, post_body);
    return res;
}

module.exports.AuthorizeCodeGrant = AuthorizeCodeGrant;
async function AuthorizeCodeGrant(code, grant_type = 'authorization_code') {
    const data = {
        client_id: getOsuClientID(),
        client_secret: getOsuClientSecret(),
        grant_type: grant_type,
        redirect_uri: getOsuClientRedirectURI(),
    }

    switch (grant_type) {
        case 'authorization_code':
            data.code = code;
            break;
        case 'refresh_token':
            data.refresh_token = code;
            break;
        default:
            throw new Error('Invalid grant type');
    }

    try {
        const response = await axios.post('https://osu.ppy.sh/oauth/token', data, {
            headers: {
                "Accept-Encoding": "gzip,deflate,compress"
            }
        });

        const user = await GetOwnData(response.data.access_token);

        if (!user || !user.id) {
            throw new Error('Invalid user data received from osu! API');
        }

        return {
            ...response.data,
            user_id: user.id
        }
    } catch (error) {
        console.error('Error during authorization code grant:', error);
        throw new Error('Failed to authorize code grant');
    }
}

module.exports.GetOwnData = GetOwnData;
async function GetOwnData(access_token) {
    try {
        const response = await AuthorizedResourceOwnerApiCall('https://osu.ppy.sh/api/v2/me', access_token, 'get');

        if (response && response.id) {
            return response;
        }
        throw new Error('Invalid response from osu! API');
    } catch (error) {
        console.error('Error during getting own data:', error);
        throw new Error('Failed to get own data from osu! API');
    }
}

module.exports.GetUserData = GetUserData;
async function GetUserData(userId) {
    try {
        const url = `https://osu.ppy.sh/api/v2/users/${userId}`;
        const response = await AuthorizedClientApiCall(url, 'get');
        if (response && response.id) {
            return response;
        }
        throw new Error('Invalid response from osu! API');
    } catch (error) {
        console.error('Error during getting user data:', error);
        throw new Error('Failed to get user data from osu! API');
    }
}

module.exports.GetUsers = GetUsers;
async function GetUsers(userIds) {
    try {
        //max 50 per request, so split into chunks
        let allUsers = [];
        for (let i = 0; i < userIds.length; i += 50) {
            const chunk = userIds.slice(i, i + 50);
            const url = `https://osu.ppy.sh/api/v2/users?ids[]=${chunk.join('&ids[]=')}`;
            const response = await AuthorizedClientApiCall(url, 'get');
            if (response && Array.isArray(response?.users)) {
                allUsers = allUsers.concat(response?.users || []);
            }
        }   
        return allUsers;
    } catch (error) {
        console.error('Error during getting users data:', error);
        throw new Error('Failed to get users data from osu! API');
    }
}

module.exports.GetReplay = GetReplay;
async function GetReplay(scoreId, read = true) {
    try {
        const url = `https://osu.ppy.sh/api/v2/scores/${scoreId}/download`;
        const response = await AuthorizedClientApiCall(url, 'get', null, 10000, null, 'application/x-osu-replay', 'arraybuffer');
        if (response) {
            //osr.reads expects a Buffer object
            if(read){
                const replay_data = await osr.read(Buffer.from(response));
                return replay_data;
            }else{
                return Buffer.from(response);
            }
        }
        throw new Error('Invalid response from osu! API');
    } catch (error) {
        console.error('Error during getting replay data:', error);
        throw new Error('Failed to get replay data from osu! API');
    }
}

module.exports.GetScore = GetScore;
async function GetScore(scoreId) {
    try {
        const url = `https://osu.ppy.sh/api/v2/scores/${scoreId}`;
        const response = await AuthorizedClientApiCall(url, 'get');
        if (response) {
            return response;
        }
        throw new Error('Invalid response from osu! API');
    } catch (error) {
        console.error('Error during getting replay data:', error);
        throw new Error('Failed to get replay data from osu! API');
    }
}

module.exports.Search = Search;
async function Search(mode = 'all', query = '', page = 1) {
    try {
        const url = `https://osu.ppy.sh/api/v2/search?mode=${mode}&query=${encodeURIComponent(query)}&page=${page}`;

        const response = await AuthorizedClientApiCall(url, 'get');
        return response;
    } catch (error) {
        console.error('Error during search:', error);
        throw new Error('Failed to search osu! API');
    }
}

module.exports.CheckAuth = CheckAuth;
async function CheckAuth(access_token, user_id = null) {
    try {
        //just call Me endpoint to check if token is valid
        const response = await GetOwnData(access_token);
        if (response && response.id) {
            if(user_id && response.id !== user_id){
                throw new Error('Token does not belong to the specified user');
            }
            return true;
        }
    } catch (error) {
        console.error('Error during auth check:', error);
    }
    return false;
}