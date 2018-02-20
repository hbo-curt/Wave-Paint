const assert=require("assert");
const models=require("../../src/models");

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
            const context=new FakeAudioContext(),
                instance=new models.SineBuffer(context, 1, 440, {});
                assert.equal(instance.frequency, 440);
                assert.equal(instance.lengthInSeconds, 1);
        });

    });
});
