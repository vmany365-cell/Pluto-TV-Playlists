(function() {
  const server = require('awebserver');
  const path = require('path');
  const fs = require('fs');
  const utils = require('#lib/utils.js');
  const api = require('#lib/plutotv/api.js');

  let sessionCache = null;
  let sessionExpiry = 0;

  const getSession = async (config, ip) => {
    const now = Date.now();

    if (sessionCache && now < sessionExpiry) {
      return sessionCache;
    }

    const uuid = config.get('uniqueClientid')
      ? utils.uuid(ip)
      : utils.uuid();

    const bootData = await api.boot(false, uuid);

    sessionCache = bootData;
    sessionExpiry = now + 5 * 60 * 1000; // 5 min cache

    return bootData;
  };

  const serve = (config) => {
    server.addRoute('/{filename}', 'GET', async (req, res) => {
      try {
        const outdir = config.get('outdir');
        const filename = path.basename(req.query.filename);
        const fullpath = `${outdir}/${filename}`;
        const { ext } = path.parse(fullpath);

        let contents = fs.readFileSync(fullpath, 'utf-8');

        let mimetype = "text/plain";

        if (ext === '.m3u8') {
          const session = await getSession(config, res.connection.remoteAddress);

          // safer replace (avoid global corruption)
          contents = contents.replace(
            config.get('clientID'),
            session.session.sessionID
          );

          contents = contents.replace(
            /jwt=[^&\s]*/g,
            `jwt=${session.sessionToken}`
          );

          mimetype = 'application/vnd.apple.mpegurl; charset=UTF-8';
        }

        if (ext === '.xml') {
          mimetype = 'text/xml';
        }

        res.response(200, contents, {
          'Content-Type': mimetype,
          'Cache-Control': 'no-cache'
        });

      } catch (ex) {
        res.response(500, 'stream error');
      }
    });

    server.serve(config.get('PORT'));
  };

  exports = module.exports = { serve };
})();
