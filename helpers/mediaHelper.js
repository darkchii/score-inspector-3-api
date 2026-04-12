const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const SPOTIFY_PATH_REGEX = /^(track|album|playlist|episode|show)\/([a-zA-Z0-9]{22})$/;
const SPOTIFY_URI_REGEX = /^spotify:(track|album|playlist|episode|show):([a-zA-Z0-9]{22})$/;

function normalizeInput(input) {
    if (typeof input !== 'string') {
        return null;
    }

    const value = input.trim();
    return value || null;
}

function tryParseUrl(value) {
    try {
        return new URL(value);
    } catch (error) {
        return null;
    }
}

function extractYoutubeId(input) {
    const value = normalizeInput(input);
    if (!value) {
        return null;
    }

    if (YOUTUBE_ID_REGEX.test(value)) {
        return value;
    }

    const parsed = tryParseUrl(value);
    if (!parsed) {
        return null;
    }
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
        const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
        return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
    }

    if (host.includes('youtube.com')) {
        const fromQuery = parsed.searchParams.get('v');
        if (fromQuery && YOUTUBE_ID_REGEX.test(fromQuery)) {
            return fromQuery;
        }

        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'embed' || pathParts[0] === 'shorts') {
            const candidate = pathParts[1] || '';
            return YOUTUBE_ID_REGEX.test(candidate) ? candidate : null;
        }
    }

    return null;
}

function extractSpotifyPath(input) {
    const value = normalizeInput(input);
    if (!value) {
        return null;
    }

    if (SPOTIFY_PATH_REGEX.test(value)) {
        return value;
    }

    const uriMatch = value.match(SPOTIFY_URI_REGEX);
    if (uriMatch) {
        return `${uriMatch[1]}/${uriMatch[2]}`;
    }

    const parsed = tryParseUrl(value);
    if (!parsed) {
        return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!host.includes('spotify.com')) {
        return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'embed') {
        pathParts.shift();
    }

    if (pathParts.length < 2) {
        return null;
    }

    const type = pathParts[0];
    const id = pathParts[1];
    const normalized = `${type}/${id}`;
    return SPOTIFY_PATH_REGEX.test(normalized) ? normalized : null;
}

module.exports = {
    extractYoutubeId,
    extractSpotifyPath,
};
