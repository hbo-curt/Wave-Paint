/**
 * Models? Just a bunch of shapes that I wanted to drop into a single place. Can
 * be split apart later.
 *
 * I stole a bunch of stuff from index.js
 */

/* eslint-disable */

/**
 * Base class for anything that wants be an audio star.
 */
class AudioBase {
    /**
     * @param {AudioContext} context
     */
    constructor(context) {
        this._context = context;
    }

    /**
     * @returns {AudioContext}
     */
    get context() {
        return this._context;
    }

    /**
     * @returns {number}
     */
    get sampleRate() {
        return this._context.sampleRate;
    }

    secondsToSampleOffset(seconds) {
        return Math.floor(this._context.sampleRate * seconds);
    }

    sampleOffsetToSeconds(sample) {
        return Math.floor(sample / this._context.sampleRate);
    }
}

class SampleBuffer extends AudioBase {
    /**
     * @param {AudioContext} context
     * @param {Number} duration
     * @param {Number} channels
     */
    constructor(context, duration, {channels = 1}) {
        super(context);
        this._duration = duration;
        const sampleLength = this.secondsToSampleOffset(duration);
        this._buffer = this._context.createBuffer(channels, sampleLength, this._context.sampleRate);
    }

    /**
     * @returns {AudioBuffer}
     */
    get buffer() {
        return this._buffer;
    }

    /**
     * Length in seconds
     * @returns {Number}
     */
    get secondLength() {
        return this._duration;
    }

    /**
     * @returns {Number}
     */
    get sampleLength() {
        return this.secondsToSampleOffset(this._duration);
    }

    get channelCount() {
        return this._buffer.numberOfChannels;
    }

    /**
     * Mixes buffer passed in as param into this buffer using the binary operation specified as param
     * @param {SampleBuffer} buffer
     * @param {Function} binaryOp
     */
    mix(buffer, binaryOp = (s1, s2) => s1 + s2) {
        const count = Math.min(buffer.sampleLength, this.sampleLength);
        for(let channelIndex = 0; channelIndex < this._buffer.numberOfChannels; channelIndex++) {
            const channelUs = this._buffer.getChannelData(channelIndex),
                channelThem = (buffer.channelCount > channelIndex)
                    ? buffer.buffer.getChannelData(channelIndex)
                    : buffer.buffer.getChannelData(0);
            for(let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
                channelUs[sampleIndex] = binaryOp(channelUs[sampleIndex], channelThem[sampleIndex]);
            }
        }
    }

    /**
     * Adds the specified buffer to <code>this</code>
     * @param {SampleBuffer} buffer
     */
    add(buffer) {
        this.mix(buffer, (s1, s2) => s1 + s2);
    }

    /**
     * Multiplies the specified buffer to <code>this</code>
     * @param {SampleBuffer} buffer
     */
    mult(buffer) {
        this.mix(buffer, (s1, s2) => s1 * s2);
    }
}

class SineBuffer extends SampleBuffer {
    /**
     * @param {AudioContext} context
     * @param {Number} duration
     * @param {Number} frequency
     * @param {Number} channels
     * @param {Number} phase
     * @param {Number} amplitude
     */
    constructor(context, duration, frequency, {channels = 1, phase = 0, amplitude = 1}) {
        super(context, duration, {channels: channels});
        this.frequency = frequency;
        this.phase = phase;
        this.amplitude = amplitude;
        for(let channelIndex = 0; channelIndex < this._buffer.numberOfChannels; channelIndex++) {
            const channelData = this._buffer.getChannelData(channelIndex);
            for(let sampleIndex = 0; sampleIndex < this._buffer.length; sampleIndex++) {
                const t = (sampleIndex * Math.PI * 2) / this.sampleRate;
                channelData[sampleIndex] = Math.sin(t * frequency + phase) * amplitude;
            }
        }
    }
}

/**
 * He is the envelope. He requires an algorithm to do the things he needs to get things done.
 */
class EnvelopeBase extends SampleBuffer {
    /**
     * @param {AudioContext} context
     * @param {Number} duration
     * @param {Function} algorithm
     * @param {Number} startValue the starting value of the envelope
     * @param {Number} endValue the ending value of the envelope
     * @param {Number} startTime when the envelope should start. Think of it as a delay.
     */
    constructor(context, duration, algorithm, {startValue = 0, endValue = 1, startTime = 0}) {
        super(context, duration, {});
        this._algorithm = algorithm;
        this.startValue = startValue;
        this.endValue = endValue;
        this.startTime = startTime;
        this._populateBuffer();
    }

    _populateBuffer() {
        const sampleEnvStart = this.secondsToSampleOffset(this.startTime),
            envelopWidth = (this.sampleLength - sampleEnvStart),
            channelData = this._buffer.getChannelData(0);
        for(let index = 0; index < sampleEnvStart; index++) {
            channelData[index] = this.startValue;
        }
        for(let index = sampleEnvStart; index < channelData.length; index++) {
            const multiplier = this._algorithm(index - sampleEnvStart, envelopWidth);
            channelData[index] = this.startValue + multiplier * (this.endValue - this.startValue);
        }
    }
}

/**
 * A linear envelope
 */
class LinearEnvelope extends EnvelopeBase {
    constructor(context, duration, {startValue = 0, endValue = 1, startTime = 0}) {
        const algorithm = (sampleOffset, sampleTotal) => sampleOffset / sampleTotal;
        super(context, duration, algorithm, {startValue, endValue, startTime});
    }
}

/**
 * An envelope with an exponential shape
 */
class ExponentialEnvelope extends EnvelopeBase {
    constructor(context, duration, {exponent = 2, startValue = 0, endValue = 1, startTime = 0}) {
        const algorithm = (sampleOffset, sampleTotal) => Math.pow(sampleOffset / sampleTotal, exponent);
        super(context, duration, algorithm, {startValue, endValue, startTime});
    }
}

/**
 * A pass-through envelope
 */
class PassThroughEnvelope extends EnvelopeBase {
    constructor(context, duration) {
        super(context, duration, () => 1);
    }
}

/**
 * Attack, Sustain and Release Envelope
 */
class ASREnvelope extends EnvelopeBase {
    /**
     * @param {EnvelopeBase} attack
     * @param {EnvelopeBase} sustain
     * @param {EnvelopeBase} release
     */
    constructor(attack, sustain, release) {
        const duration = attack.secondLength + sustain.secondLength + release.secondLength;
        super(attack.context, duration, () => 0, {});
        this._buffer.copyToChannel(attack.buffer.getChannelData(0), 0, 0);
        this._buffer.copyToChannel(sustain.buffer.getChannelData(0), 0, attack.buffer.length);
        this._buffer.copyToChannel(release.buffer.getChannelData(0), 0, attack.buffer.length+sustain.buffer.length);
    }

    /**
     * @param {EnvelopeBase} attack
     * @param {EnvelopeBase} release
     * @param {Number} duration
     * @returns {ASREnvelope}
     */
    static createInterpolated(attack, release, duration) {
        const sustainDuration = duration - (attack.secondLength + release.secondLength),
            sustain = new LinearEnvelope(attack.context, sustainDuration, {
                startValue: attack.endValue,
                endValue: release.startValue
            });
        return new ASREnvelope(attack, sustain, release);
    }
}

module.exports = {
    ASREnvelope,
    ExponentialEnvelope,
    LinearEnvelope,
    SineBuffer
};
