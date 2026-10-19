const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../utils/agent-guide');
test('two to three replies produce an available sound, based on answers', () => {
  assert.equal(guide.next('exam',['担心考试']).recommendation,undefined);
  assert.equal(guide.next('exam',['担心考试','想听雨声放松']).recommendation.sound,'rain');
  assert.equal(guide.next('dorm',['室友很吵','不知道']).recommendation,undefined);
  assert.equal(guide.next('dorm',['室友很吵','不知道','短一点']).recommendation.sound,'white');
  assert.equal(guide.next('dorm',['室友很吵','不知道','短一点']).recommendation.minutes,15);
});
