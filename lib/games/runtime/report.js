/**
 * Gamebox Runtime Error Reporter
 *
 * A plain script loaded before main.js so that syntax errors in main.js
 * (and any early runtime errors) still get captured and reported up to the parent app.
 *
 * Communication protocol with embedding parent:
 * - Parent polls 'game-ping'
 * - Frame answers 'game-status' with the first error it caught, or nothing if it's healthy.
 */
(function () {
  'use strict';

  var firstError = null;

  function captureError(err, event) {
    if (firstError) return;

    if (err && typeof err === 'object') {
      firstError = err;
      if (event) {
        if (event.filename && !firstError.filename) firstError.filename = event.filename;
        if (event.lineno && !firstError.lineno) firstError.lineno = event.lineno;
        if (event.colno && !firstError.colno) firstError.colno = event.colno;
      }
    } else {
      var msg = typeof err === 'string' ? err : (event && event.message) || String(err || 'Unknown error');
      var newErr;
      try {
        if (msg.indexOf('SyntaxError') !== -1) {
          newErr = new SyntaxError(msg);
        } else {
          newErr = new Error(msg);
        }
      } catch (_) {
        newErr = new Error(msg);
      }
      if (event) {
        if (event.filename) newErr.filename = event.filename;
        if (event.lineno) newErr.lineno = event.lineno;
        if (event.colno) newErr.colno = event.colno;
      }
      firstError = newErr;
    }
  }

  // 1. Listen for runtime and syntax errors (using capture phase for earliest interception)
  window.addEventListener(
    'error',
    function (event) {
      var err = event.error || event.message;
      if (!err && event.target && (event.target.src || event.target.href)) {
        err = new Error('Failed to load resource: ' + (event.target.src || event.target.href));
      }
      captureError(err, event);
    },
    true
  );

  // 2. Listen for unhandled promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    captureError(event.reason || 'Unhandled Promise Rejection', event);
  });

  // 3. Hook window.onerror for maximum compatibility
  var prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    captureError(error || message, {
      filename: source,
      lineno: lineno,
      colno: colno,
      message: message,
    });
    if (typeof prevOnError === 'function') {
      return prevOnError.apply(this, arguments);
    }
    return false;
  };

  // 4. Message handling: answer game-ping with game-status
  function isPing(data) {
    if (data === 'game-ping') return true;
    if (data && typeof data === 'object') {
      return (
        data.type === 'game-ping' ||
        data.action === 'game-ping' ||
        data.event === 'game-ping'
      );
    }
    if (typeof data === 'string') {
      try {
        var parsed = JSON.parse(data);
        return (
          parsed === 'game-ping' ||
          (parsed &&
            (parsed.type === 'game-ping' ||
              parsed.action === 'game-ping' ||
              parsed.event === 'game-ping'))
        );
      } catch (_) {}
    }
    return false;
  }

  window.addEventListener('message', function (event) {
    if (!isPing(event.data)) return;

    var response = { type: 'game-status' };
    if (firstError) {
      response.error = firstError;
    }

    var target =
      event.source ||
      (window.parent !== window ? window.parent : null) ||
      window.opener ||
      window;

    if (target && typeof target.postMessage === 'function') {
      try {
        target.postMessage(response, '*');
      } catch (_) {
        // Fallback if structured clone fails on the error object
        try {
          var serializedError = firstError;
          if (firstError instanceof Error) {
            serializedError = {
              name: firstError.name,
              message: firstError.message,
              stack: firstError.stack,
              filename: firstError.filename,
              lineno: firstError.lineno,
              colno: firstError.colno,
            };
          } else if (typeof firstError === 'object') {
            serializedError = {
              name: firstError.name || 'Error',
              message: firstError.message || String(firstError),
              stack: firstError.stack || '',
              filename: firstError.filename || '',
              lineno: firstError.lineno || 0,
              colno: firstError.colno || 0,
            };
          } else {
            serializedError = String(firstError);
          }
          response.error = serializedError;
          target.postMessage(response, '*');
        } catch (__) {
          response.error = String(
            firstError && firstError.message
              ? firstError.message
              : firstError
          );
          target.postMessage(response, '*');
        }
      }
    }
  });
})();
