const express = require('express');
const router = express.Router();

router.get('/:teamId', async (req, res) => {
    //not implemented yet
    return res.status(501).json({ error: 'Not implemented yet' });
});

module.exports = router;
