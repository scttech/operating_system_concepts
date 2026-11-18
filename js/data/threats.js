/* Threat-modeling exercises for Module 3. Each system lists threats; the learner classifies each one with STRIDE
 * (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege).
 * threat: { text, cat: "S|T|R|I|D|E", why: why it belongs to that category, fix: a usual defense } */
window.OSData = window.OSData || {};
window.OSData.threatSystems = [
  {
    id: "photos", name: "A photo-sharing website",
    description: "People sign in from a browser, upload photos and share them with friends. A web server handles requests, a database stores accounts and captions, and an object store holds the image files.",
    components: ["Browser", "Web server", "Database", "Image storage"],
    threats: [
      { text: "Someone signs in with a password stolen from another website and posts as the account's owner.", cat: "S", why: "The attacker pretends to be another user. Spoofing is about identity.", fix: "Multi-factor sign-in, checking passwords against known breaches, and limiting login attempts." },
      { text: "An attacker on a shared Wi-Fi network changes a photo while it travels from the browser to the server.", cat: "T", why: "Data is modified without permission while in transit. Tampering is about integrity.", fix: "Encrypt and authenticate traffic with TLS, and check uploads on the server." },
      { text: "A user uploads something abusive and later claims they never did, and the site has no record that links the upload to them.", cat: "R", why: "Nothing can prove who did what, so the user can deny it. Repudiation is about accountability.", fix: "Keep tamper-resistant audit logs that record the user, the time and the action." },
      { text: "A storage setting is wrong, so anyone with the link can download photos marked private.", cat: "I", why: "Information reaches people who were not allowed to see it. That is disclosure.", fix: "Make storage private by default, enforce access policies, and test them." },
      { text: "A flood of automated requests keeps real users from loading the site.", cat: "D", why: "The service becomes unavailable to the people who need it.", fix: "Rate limiting, a content delivery network, and capacity planning." },
      { text: "A bug lets an ordinary user perform administrator actions, such as deleting anyone's account.", cat: "E", why: "A user gains abilities they should not have. That is elevation of privilege.", fix: "Check permissions on the server for every action, and use least privilege." },
      { text: "An email that looks like it came from the site sends people to a fake sign-in page.", cat: "S", why: "The attacker impersonates the site itself to fool users.", fix: "Email authentication, user education, and security keys that only work on the real site." }
    ]
  },
  {
    id: "lock", name: "A smart door lock",
    description: "A lock on a front door is controlled by a phone app. The phone talks to the lock over a short-range radio, and to a cloud service that manages guests and keeps a history of use.",
    components: ["Phone app", "Radio link", "Lock", "Cloud service"],
    threats: [
      { text: "An attacker records the radio message that unlocks the door and plays it back later.", cat: "S", why: "The attacker passes as the authorized phone by replaying its credentials. It is an identity attack.", fix: "Use one-time challenges so a recorded message is useless, and bind messages to the specific phone." },
      { text: "Someone installs modified firmware on the lock that always opens for them.", cat: "T", why: "The lock's code is changed without permission. Tampering is about integrity of data and code.", fix: "Only run firmware that is signed by the maker, and verify it at every boot (a chain of trust)." },
      { text: "The lock keeps no record, so a household cannot tell who opened the door at 2 a.m.", cat: "R", why: "No evidence exists to attribute actions to a person. Repudiation is about accountability.", fix: "Log every unlock with the user and the time, and protect the log from alteration." },
      { text: "The app sends the door code to the cloud service without encryption, where anyone on the network can read it.", cat: "I", why: "Secret information is exposed to an eavesdropper. That is disclosure.", fix: "Encrypt all communication, and avoid sending secrets that do not need to be sent." },
      { text: "Jamming the radio frequency, or running down the lock's battery, stops the door from working.", cat: "D", why: "The service stops being available to the owner. Availability attacks need not touch the data at all.", fix: "A physical key or backup entry method, low-battery warnings, and power-efficient design." },
      { text: "A guest who was given access for one day uses a flaw to make themselves an owner and add permanent keys.", cat: "E", why: "A low-privilege account gains owner abilities. That is elevation of privilege.", fix: "Enforce roles in the lock and in the cloud, and never trust the app to decide what it may do." },
      { text: "A fake lock appears on the network and tricks the app into sending it the unlock code.", cat: "S", why: "The attacker impersonates the real lock to the app, so the spoofing goes in the other direction.", fix: "Mutual authentication: the app must verify the lock's identity, not only the other way round." }
    ]
  },
  {
    id: "hospital", name: "A hospital records server",
    description: "Doctors and nurses use terminals to view and update patient records. An application server talks to a database, and nightly backups are copied to tape that is stored off site.",
    components: ["Staff terminals", "Application server", "Database", "Backup tapes"],
    threats: [
      { text: "A person at a shared terminal uses a colleague's session, which was left signed in.", cat: "S", why: "They act under another person's identity. Spoofing includes using someone's authenticated session.", fix: "Automatic sign-out, badge-based fast switching between users, and short session lifetimes." },
      { text: "A malicious insider quietly changes a patient's allergy information.", cat: "T", why: "Data is altered without authorization. In medicine, the harm of tampering can be physical.", fix: "Record every change with its author, require review for sensitive fields, and keep change history." },
      { text: "A doctor denies viewing a famous patient's record, and the system has no access log that could show otherwise.", cat: "R", why: "There is no proof of who accessed the record, so the action can be denied.", fix: "Log all record access with the person, time and reason, and review the logs." },
      { text: "Backup tapes holding patient data are lost in transit, and they were not encrypted.", cat: "I", why: "Sensitive information ends up in the wrong hands. That is disclosure.", fix: "Encrypt backups and manage the keys separately from the tapes." },
      { text: "A flood of failed sign-in attempts locks every account out during an emergency.", cat: "D", why: "Legitimate users cannot reach the service. A defense (account lockout) was turned into an attack.", fix: "Lock out by source and add delays rather than locking the account, with a break-glass emergency procedure." },
      { text: "A nurse's account can run database administration commands, because the application always connects with an all-powerful database account.", cat: "E", why: "Ordinary users reach abilities beyond their role. That is elevation of privilege.", fix: "Give the application the least database privilege it needs, and enforce roles in the data layer." },
      { text: "A search shows the names of patients who are not under the searcher's care.", cat: "I", why: "Information is revealed to people with no need to know it.", fix: "Limit results to the patients a user is assigned to, with an audited override." }
    ]
  }
];
