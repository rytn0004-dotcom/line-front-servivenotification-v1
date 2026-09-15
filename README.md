# LINE Frontend / Customer Service Web Service v1.3

Fixes Google Sheet header-row handling for the `聯絡人` sheet when a title row sits above the actual header row.

Menu: `選單` -> 1 binding / 2 course lookup unavailable / 3 payment-receipt unavailable / 4 human support.

Parent binding: student names -> one confirmation -> write to `聯絡人`.
Teacher binding: registered system name -> one confirmation -> LINE display name stays in `姓名`, entered teacher name goes to `學生姓名/關聯（可多位）`.

Render: Build `npm install`; Start `node server.js`; Health `/health`.
