const assert = require("assert");
const models = require("../../src/models");

class FakeAudioContext {
	constructor() {
	}
	createBuffer(channels, length, sampleRate) {
		return {};
	}
}

describe("models", function() {
	describe("SineBuffer", function() {
		it("should construct properly", function() {
			const context = new FakeAudioContext(),
				instance = new models.SineBuffer(context, 1, 440, {});
			assert.equal(instance.frequency, 440);
			assert.equal(instance.lengthInSeconds, 1);
		});
	});

	describe("WaveStack", function() {
		it("should insert properly", function() {
			const context = new FakeAudioContext(),
				sampleBuffer = new models.SineBuffer(context, 1, 440, {}),
				instance = new models.WaveStack(context, 2, {}),
				index = instance.addSampleBuffer(sampleBuffer);
			assert.equal(index, 0);
			assert.equal(instance.getStackSampleBufferCount, 1);
			assert.equal(instance.getStackSampleBuffer(0), sampleBuffer);
		});

		it("should delete properly", function() {
			const context = new FakeAudioContext(),
				sampleBuffer = new models.SineBuffer(context, 1, 440, {}),
				instance = new models.WaveStack(context, 2, {});
			instance.addSampleBuffer(sampleBuffer);
			instance.removeSampleBuffer(sampleBuffer);
			assert.equal(instance.getStackSampleBufferCount, 0);
		});

		it("should replace properly", function() {
			const context = new FakeAudioContext(),
				sampleBuffer1 = new models.SineBuffer(context, 1, 440, {}),
				sampleBuffer2 = new models.SineBuffer(context, 1, 440, {}),
				instance = new models.WaveStack(context, 2, {});
			instance.addSampleBuffer(sampleBuffer1);
			instance.replaceSampleBuffer(sampleBuffer1, sampleBuffer2);
			assert.equal(instance.getStackSampleBufferCount, 1);
			assert.equal(instance.getStackSampleBuffer(0), sampleBuffer2);
		});

		it("should throw exception if replace cannot find his man", function() {
			const context = new FakeAudioContext(),
				instance = new models.WaveStack(context, 2, {}),
				sampleBuffer = new models.SineBuffer(context, 1, 440, {});
			assert.throws(()=>instance.replaceSampleBuffer(sampleBuffer, sampleBuffer));
		});

		it("should get and set the muted state", function() {
			const context = new FakeAudioContext(),
				sampleBuffer = new models.SineBuffer(context, 1, 440, {}),
				instance = new models.WaveStack(context, 2, {}),
				index = instance.addSampleBuffer(sampleBuffer);
			instance.setMutedState(index, true);
			assert.equal(instance.getMutedState(index), true);
			instance.setMutedState(sampleBuffer, false);
			assert.equal(instance.getMutedState(sampleBuffer), false);
		});
	});
});
