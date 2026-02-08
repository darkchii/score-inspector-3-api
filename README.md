# osu! scores inspector v3 api

This is the API server for osu! scores inspector v3.
There is no database (example) available as this partially depends on the osu!alternative v2 database, which in itself is not public.
However, all the database models can be found in `/models/` directory.

## Requirements
- MariaDB (for score inspector related data)
- PostgresQL (osu!alternative runs on this)
- Node.js & npm
- osu! diff lookup cache (github.com/ppy/osu-beatmap-difficulty-lookup-cache)

## Environment variables
Configuration is done through a `.env` file.

    NODE_ENV=development
    PORT= #web server port
    MYSQL_USER=
    MYSQL_PASS=
    MYSQL_HOST=
    MYSQL_DB=
    MYSQL_DB_TEAM= #teams live in a dedicated database
    ALT_DB_USER=
    ALT_DB_PASSWORD=
    ALT_DB_HOST=
    ALT_DB_PORT=
    ALT_DB_DATABASE=
    OSU_CLIENT_ID=
    OSU_CLIENT_ID_DEV=
    OSU_CLIENT_SECRET=
    OSU_CLIENT_SECRET_DEV=
    OSU_CLIENT_REDIRECT=
    OSU_CLIENT_REDIRECT_DEV=
    DIFF_CALC_URL=
    DIFF_CALC_URL_DEV=


