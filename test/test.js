const assert = require('assert');
const firebase = require('@firebase/testing');
const { create } = require('domain');

const MY_PROJECT_ID = "poll-app-8877f";

const auth = {uid: "user_abc", email: "ms19117@iisermohali.ac.in", email_verified: true};
const auth2 = {uid: "user_xyz", email: "james@iisermohali.ac.in", email_verified: true};
const user1 = {uid: "user_1", email: "user1@iisermohali.ac.in", email_verified: true};
const user2 = {uid: "user_2", email: "user2@iisermohali.ac.in", email_verified: true};
const user3 = {uid: "user_3", email: "user3@iisermohali.ac.in", email_verified: true};
const unAuth = {uid: "user_xyz", email: "james@gmail.com", email_verified: true};

class Poll {
	constructor(topic, createdBy, description, type, isAnonymous, active, questions) {
        this.topic = topic;
        this.createdBy = createdBy;
		this.description = description;
		this.type = type;
        this.isAnonymous = isAnonymous;
        this.active = active;
		this.questions = questions;
	}
}

pollConverter = {
	toFirestore: function (poll) {
		return {
            topic: poll.topic,
            createdBy: poll.createdBy,
            active: poll.active,
			description: poll.description,
			type: poll.type,
			isAnonymous: poll.isAnonymous,
			questions: poll.questions.map(q => questionConverter.toFirestore(q))
		}
	},
	fromFirestore: function (snapshot, options) {
		const data = snapshot.data(options);
		return new Poll(data.topic, data.createdBy, data.description, data.type, data.isAnonymous, data.active, data.questions.map(q => questionConverter.toObject(q)))
	}
}

class Question {
	constructor(questionStr, type, options) {
		this.questionStr = questionStr;
		this.type = type;
		this.options = options;
	}
}

questionConverter = {
	toFirestore: function (question) {
		return {
			questionStr: question.questionStr,
			type: question.type,
			options: question.options
		}
	},
	fromFirestore: function (snapshot, options) {
		const data = snapshot.data(options);
		return new Question(data.questionStr, data.type, data.options)
	},
	toObject: function (question) {
		return new Question(question.questionStr, question.type, question.options)
	}
}

function encodeToFirebaseKey(s) {
	s = encodeURIComponent(s);
	return s.replace(/\*/g, "%2A").replace(/\./g, "%2E").replace(/\~/g, "%7E").replace(/\_/g, "%5F").replace(/\!/g, "%21").replace(/\'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\-/g, "%2D");
}

function decodeFromFirebaseKey(s) {
	s = s.replace(/%2A/g, "*").replace(/%2E/g, ".").replace(/%7E/g, "~").replace(/%5F/g, "_").replace(/%21/g, "!").replace(/%27/g, "'").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%2D/g, "-");
	return s = decodeURIComponent(s);
}

function getFirestore (authObj) {
    return firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: authObj}).firestore();
}

function getAdminFirestore () {
    return firebase.initializeAdminApp({projectId: MY_PROJECT_ID}).firestore();
}

beforeEach(async() => {
    await firebase.clearFirestoreData({projectId: MY_PROJECT_ID});
    var Q1 = new Question("Q1", 0, ['Yes', 'No']);
    var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
    var Q3 = new Question("Q3", 2, null);
    var poll = new Poll("TestPoll1","ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
    var db = getAdminFirestore();
    var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
    var pollListDb = db.collection("ListWiseActivePolls").doc("All");
    var batch = db.batch();
    batch.set(pollDb, pollConverter.toFirestore(poll));
    batch.set(pollListDb, {"ActivePolls": []});
    batch.set(pollListDb, {"ClosedPolls": []})
    batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
    if (poll.isAnonymous) {
        var pollObj = {};
        var i;
        for (i = 0; i < poll.questions.length; i++) {
            var qtype = poll.questions[i].type;
            var optionsObj = {};
            if (qtype == 0 || qtype == 1) {
                var j;
                for (j = 0; j < poll.questions[i].options.length; j++) {
                    optionsObj[poll.questions[i].options[j]] = 0;
                }
                pollObj[poll.questions[i].questionStr] = optionsObj;
            } else {
                pollObj[poll.questions[i].questionStr] = { "Responses": [] };
            }
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
    }
    batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
    await batch.commit();
});

describe("Unit testing for poll-app", () => {
    
    it("Allows IISERites to read a poll's contents", async() => {
        var db = getFirestore(auth);
        await firebase.assertSucceeds(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollContent").withConverter(pollConverter).get());
    });

    it("Doesn't allow non IISERites to read a poll's contents", async() => {
        var db = getFirestore(unAuth);
        await firebase.assertFails(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollContent").withConverter(pollConverter).get());
    });

    it("Allows IISERites to read a poll's results.", async() => {
        var db = getFirestore(auth);
        firebase.assertSucceeds(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollResults").get());
    });

    it("Doesn't allow non IISERites to read a poll's results.", async() => {
        var db = getFirestore(unAuth);
        await firebase.assertFails(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollResults").get());
    });

    it("Allows poll creation from IISERites", async() => {
        var db = getFirestore(auth);
        var poll = new Poll("AllowPollCreation", "ms19117@iisermohali.ac.in", "A test", 0, true, true, [new Question("Q1", 0, ['Yes', 'No'])]);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": [] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
        await firebase.assertSucceeds(batch.commit());
    });

    it("Doesn't allow poll creation from non IISERites.", async() => {
        var db = getFirestore(unAuth);
        var poll = new Poll("Don'tAllow", "ms19117@iisermohali.ac.in", "A test", 0, true, true, [new Question("Q1", 0, ['Yes', 'No'])]);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": [] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow invalid poll creation.", async() => {
        var db = getFirestore(auth);
        var poll = new Poll("Invalid poll", "ms19117@iisermohali.ac.in", null, 0, true, true, []);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": [] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow invalid additions to ActivePolls/All doc", async() => {
        var db = getFirestore(auth);
        await firebase.assertFails(db.collection("ActivePolls").doc("All").set({"ActivePolls": "Shouldn't be allowed"}));
    });

    it("Doesn't allow poll creation with invalid results doc", async() => {
        var db = getFirestore(auth);
        var poll = new Poll("Has Invalid poll results doc", "ms19117@iisermohali.ac.in", null, 0, true, true, [new Question("Q1", 0, ["Yes", "No"])]);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 11;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": ["Fuck You developers."] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow poll creation with invalid already voted docs", async() => {
        var db = getFirestore(auth);
        var poll = new Poll("Has Invalid poll already voted docs", "ms19117@iisermohali.ac.in", null, 0, true, true, [new Question("Q1", 0, ["Yes", "No"])]);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": ["Fuck You developers."] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": ["ms19117@iisermohali.ac.in"] });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow poll creation without an already voted doc", async() => {
        var db = getFirestore(auth);
        var poll = new Poll("No ALready voted doc", "ms19117@iisermohali.ac.in", null, 0, true, true, [new Question("Q1", 0, ["Yes", "No"])]);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": ["Fuck You developers."] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow poll already voted doc creation without a poll doc", async() => {
        var db = getFirestore(auth);
        await firebase.assertFails(db.collection("Polls").doc("Redundant").collection("This shouldn't work").doc("AlreadyVoted").set({"AlreadyVoted": [] }));
    });

    it("Doesn't allow poll overwrite", async() => {
        var Q1 = new Question("Q1", 1, ['X', 'Y']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var poll = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        var db = getFirestore(auth);
        var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
        var pollListDb = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.set(pollDb, pollConverter.toFirestore(poll));
        batch.set(pollListDb, {"ActivePolls": []});
        batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
        if (poll.isAnonymous) {
            var pollObj = {};
            var i;
            for (i = 0; i < poll.questions.length; i++) {
                var qtype = poll.questions[i].type;
                var optionsObj = {};
                if (qtype == 0 || qtype == 1) {
                    var j;
                    for (j = 0; j < poll.questions[i].options.length; j++) {
                        optionsObj[poll.questions[i].options[j]] = 0;
                    }
                    pollObj[poll.questions[i].questionStr] = optionsObj;
                } else {
                    pollObj[poll.questions[i].questionStr] = { "Responses": [] };
                }
            }
            batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
        }
        batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
        await firebase.assertFails(batch.commit());
    });

    it("Allows a valid poll response submission", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("Allowed a valid poll response of yes and B");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertSucceeds(batch.commit());
    });

    it("Doesn't allow poll response submission from non-IISERites", async() => {
        var responseMap = {};
        var db = getFirestore(unAuth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow poll response submission if SCQ increment is greater than 1", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(2);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow MCQ like submission in SCQ", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow no response in my response section", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow multiple response in my response section", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response1", "My Response2");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth2.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow response submission without adding name to already voted", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow response submission twice from same user", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
         var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await batch.commit();
        var responseMap2 = {};
        responseMap2[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response trying second time");
        var batch2 = db.batch();
        batch2.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        await firebase.assertFails(batch2.commit());
    });

    it("Doesn't allow response submission twice(second test)", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
         var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await batch.commit();
        var responseMap2 = {};
        responseMap2[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response trying second time");
        var batch2 = db.batch();
        batch2.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch2.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch2.commit());
    });

    it("Doesn't allow response submission twice(third test)", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
         var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await batch.commit();
        var responseMap2 = {};
        responseMap2[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap2[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response trying second time");
        var batch2 = db.batch();
        batch2.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch2.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth2.email) });
        await firebase.assertFails(batch2.commit());
    });

    it("Doesn't allow response submission in somebody else's name", async() => {
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
         var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("My Response");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth2.email) });
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow adding an id to the list of already voted illegally", async() => {
        var db = getFirestore(auth);
        await firebase.assertFails(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PeopleWhoHaveAlreadyVoted").update({"AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth2.email)}));
    });

    it("Doesn't allow removing an id from already voted list", async() => {
        var db = getFirestore(auth);
        await firebase.assertFails(db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PeopleWhoHaveAlreadyVoted").update({"AlreadyVoted": firebase.firestore.FieldValue.arrayRemove(auth.email)}));
    });

    it("Allows closing a poll from creator", async() => {
        var db = getFirestore(auth);
        var pollRef = db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollContent");
        var pollListRef = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.update(pollRef, {"active": false});
        batch.update(pollListRef, {"ActivePolls": firebase.firestore.FieldValue.arrayRemove("TestPoll1")});
        batch.update(pollListRef, {"ClosedPolls": firebase.firestore.FieldValue.arrayUnion("TestPoll1")});
        await firebase.assertSucceeds(batch.commit());
    });

    it("Doesn't allow closing a poll from non-creator", async() => {
        var db = getFirestore(auth2);
        var pollRef = db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollContent");
        var pollListRef = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.update(pollRef, {"active": false});
        batch.update(pollListRef, {"ActivePolls": firebase.firestore.FieldValue.arrayRemove("TestPoll1")});
        batch.update(pollListRef, {"ClosedPolls": firebase.firestore.FieldValue.arrayUnion("TestPoll1")});
        await firebase.assertFails(batch.commit());
    });

    it("Doesn't allow writes to a closed poll", async() => {
        var db = getFirestore(auth);
        var pollRef = db.collection("Polls").doc("Redundant").collection("TestPoll1").doc("PollContent");
        var pollListRef = db.collection("ListWiseActivePolls").doc("All");
        var batch = db.batch();
        batch.update(pollRef, {"active": false});
        batch.update(pollListRef, {"ActivePolls": firebase.firestore.FieldValue.arrayRemove("TestPoll1")});
        batch.update(pollListRef, {"ClosedPolls": firebase.firestore.FieldValue.arrayUnion("TestPoll1")});
        await batch.commit();
        var responseMap = {};
        var db = getFirestore(auth);
        var Q1 = new Question("Q1", 0, ['Yes', 'No']);
        var Q2 = new Question("Q2", 1, ['A', 'B', 'C']);
        var Q3 = new Question("Q3", 2, null);
        var testPoll1Read = new Poll("TestPoll1", "ms19117@iisermohali.ac.in", "This is a test.", 0, true, true, [Q1, Q2, Q3]);
        responseMap[testPoll1Read.questions[0].questionStr + "." + testPoll1Read.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[1].questionStr + "." + testPoll1Read.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
        responseMap[testPoll1Read.questions[2].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("Allowed a valid poll response of yes and B");
        var batch = db.batch();
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PollResults"), responseMap);
        batch.update(db.collection("Polls").doc("Redundant").collection(testPoll1Read.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
        await firebase.assertFails(batch.commit());
    });

    // it("Allows another submission from a different user", async() => {
    //     var Q1 = new Question("Q1", 0, ['Yes', 'No', 'Unsure']);
    //     var Q2 = new Question("Q2", 0, ['A', 'B', 'C']);
    //     var Q3 = new Question("Q3", 1, ['W', 'X', 'Y', 'Z']);
    //     var Q4 = new Question("Q4", 2, null);
    //     var poll = new Poll("PollForTestingResponse", "This is a test.", 0, true, [Q1, Q2, Q3, Q4]);
    //     var db = getAdminFirestore();
    //     var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
    //     var pollListDb = db.collection("ListWiseActivePolls").doc("All");
    //     var batch = db.batch();
    //     batch.set(pollDb, pollConverter.toFirestore(poll));
    //     batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
    //     if (poll.isAnonymous) {
    //         var pollObj = {};
    //         var i;
    //         for (i = 0; i < poll.questions.length; i++) {
    //             var qtype = poll.questions[i].type;
    //             var optionsObj = {};
    //             if (qtype == 0 || qtype == 1) {
    //                 var j;
    //                 for (j = 0; j < poll.questions[i].options.length; j++) {
    //                     optionsObj[poll.questions[i].options[j]] = 0;
    //                 }
    //                 pollObj[poll.questions[i].questionStr] = optionsObj;
    //             } else {
    //                 pollObj[poll.questions[i].questionStr] = { "Responses": [] };
    //             }
    //         }
    //         batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
    //     }
    //     batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
    //     await batch.commit();
    //     var responseMap = {};
    //     var db = getFirestore(auth);
    //     responseMap[poll.questions[0].questionStr + "." + poll.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[1].questionStr + "." + poll.questions[1].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[3].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("Allowed a valid poll response of yes and A and W");
    //     var batch = db.batch();
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), responseMap);
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
    //     await batch.commit();
    //     var responseMap = {};
    //     var db = getFirestore(user1);
    //     responseMap[poll.questions[0].questionStr + "." + poll.questions[0].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[1].questionStr + "." + poll.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[2]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[3].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("Allowed a valid poll response of no, b, x and y");
    //     var batch = db.batch();
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), responseMap);
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(user1.email) });
    //     await firebase.assertSucceeds(batch.commit());
    // });

    // it("Allows submission to when were you born poll", async() => {
    //     var Q1 = new Question("In January", 0, [encodeToFirebaseKey("1/2/2000"), encodeToFirebaseKey("1/10/2010")]);
    //     var Q2 = new Question("In February", 0, [encodeToFirebaseKey("2/204"), "%"]);
    //     var Q3 = new Question("Dum", 1, ["G", "-"]);
    //     var poll =  new Poll("When were you borm", "Test", 0, true, [Q1, Q2, Q3]);
    //     var db = getFirestore(auth);
    //     var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
    //     var pollListDb = db.collection("ListWiseActivePolls").doc("All");
    //     var batch = db.batch();
    //     batch.set(pollDb, pollConverter.toFirestore(poll));
    //     batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
    //     if (poll.isAnonymous) {
    //         var pollObj = {};
    //         var i;
    //         for (i = 0; i < poll.questions.length; i++) {
    //             var qtype = poll.questions[i].type;
    //             var optionsObj = {};
    //             if (qtype == 0 || qtype == 1) {
    //                 var j;
    //                 for (j = 0; j < poll.questions[i].options.length; j++) {
    //                     optionsObj[poll.questions[i].options[j]] = 0;
    //                 }
    //                 pollObj[poll.questions[i].questionStr] = optionsObj;
    //             } else {
    //                 pollObj[poll.questions[i].questionStr] = { "Responses": [] };
    //             }
    //         }
    //         batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
    //     }
    //     batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
    //     await batch.commit();
    //     var responseMap = {};
    //     var batch = db.batch();
    //     var db = getFirestore(auth);
    //     responseMap[poll.questions[0].questionStr + "." + poll.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[1].questionStr + "." + poll.questions[1].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     var batch = db.batch();
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), responseMap);
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
    //     await batch.commit();
    //     var responseMap = {};
    //     var batch = db.batch();
    //     var db = getFirestore(user1);
    //     responseMap[poll.questions[0].questionStr + "." + poll.questions[0].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[1].questionStr + "." + poll.questions[1].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[0]] = firebase.firestore.FieldValue.increment(1);
    //     responseMap[poll.questions[2].questionStr + "." + poll.questions[2].options[1]] = firebase.firestore.FieldValue.increment(1);
    //     var batch = db.batch();
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), responseMap);
    //     batch.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(user1.email) });
    //     await firebase.assertSucceeds(batch.commit());
    // });

    // it("Allows submission", async() => {
    //     var db = getFirestore(auth);
    //     var poll = new Poll("A Test", "None", 0, true, [new Question("Q1", 2, null)]);
    //     var pollDb = db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollContent").withConverter(pollConverter);
    //     var pollListDb = db.collection("ListWiseActivePolls").doc("All");
    //     var batch = db.batch();
    //     batch.set(pollDb, pollConverter.toFirestore(poll));
    //     batch.update(pollListDb, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) });
    //     if (poll.isAnonymous) {
    //         var pollObj = {};
    //         var i;
    //         for (i = 0; i < poll.questions.length; i++) {
    //             var qtype = poll.questions[i].type;
    //             var optionsObj = {};
    //             if (qtype == 0 || qtype == 1) {
    //                 var j;
    //                 for (j = 0; j < poll.questions[i].options.length; j++) {
    //                     optionsObj[poll.questions[i].options[j]] = 0;
    //                 }
    //                 pollObj[poll.questions[i].questionStr] = optionsObj;
    //             } else {
    //                 pollObj[poll.questions[i].questionStr] = { "Responses": [] };
    //             }
    //         }
    //         batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), pollObj)
    //     }
    //     batch.set(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": [] });
    //     await batch.commit();
    //     var batchResp = db.batch();
    //     var responseMap = {};
    //     responseMap[poll.questions[0].questionStr + ".Responses"] = firebase.firestore.FieldValue.arrayUnion("Too much shit");
    //     batchResp.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PollResults"), responseMap);
    //     batchResp.update(db.collection("Polls").doc("Redundant").collection(poll.topic).doc("PeopleWhoHaveAlreadyVoted"), { "AlreadyVoted": firebase.firestore.FieldValue.arrayUnion(auth.email) });
    //     await firebase.assertSucceeds(batchResp.commit());
    // });

    // it("Allows valid creation", async() => {
    //     var db = firebase.initializeTestApp({projectId: MY_PROJECT_ID, auth: auth}).firestore();
    //     var batch = db.batch();
    //     var poll = new Poll("Topic", [new Question("Q1", ["A", "B"])]);
    //     var pollDbPath = db.collection("Polls").doc("TestPoll1").withConverter(pollConverter);
    //     var pollNameListPath = db.collection("PollsList").doc("List");
    //     batch.set(pollDbPath, pollConverter.toFirestore(poll));
    //     batch.set(pollNameListPath, {"ActivePolls": []});
    //     batch.update(pollNameListPath, { "ActivePolls": firebase.firestore.FieldValue.arrayUnion(poll.topic) })
    //     await firebase.assertSucceeds(batch.commit());
    // });

});

// class Poll {
//     constructor(topic, questions) {
//         this.topic = topic;
//         this.questions =questions;
//     }
// }

// class Question {
//     constructor(name, options) {
//         this.name = name;
//         this.options = options;
//     }
// }

// pollConverter = {
// 	toFirestore: function (poll) {
// 		return {
// 			topic: poll.topic,
// 			questions: poll.questions.map(q => questionConverter.toFirestore(q))
// 		}
// 	}
// }

// questionConverter = {
//     toFirestore: function (question) {
//         return {
//             name: question.name,
//             options: question.options 
//         }
//     }
// }
