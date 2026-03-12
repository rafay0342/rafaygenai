# Ops Notes

- Analytics debug: GET `/api/analytics/track` with header `Authorization: grok <anything>` to return summary JSON.
- Weekly analytics snapshot: `npm run analytics:weekly` (prints to stdout). Set env `SEND_COMMAND` to pipe the body to your mailer, e.g. `SEND_COMMAND="mail -s 'Weekly analytics' you@example.com" npm run analytics:weekly`.
