/**
 * Models? Just a bunch of shapes that I wanted to drop into a single place. Can
 * be split apart later.
 *
 * I stole a bunch of stuff from index.js
 */

/* eslint-disable */

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

    get sampleRate() {
        return this._context.sampleRate;
    }

    secondsToSampleOffset(seconds) {
        return Math.floor(this._context.sampleRate * seconds);
    }

    createEmptyBuffer(seconds, channels = 1) {
        const sampleLength = this.secondsToSampleOffset(seconds);
        return this._context.createBuffer(channels, sampleLength, this._context.sampleRate);
    }
}

class SampleBuffer extends AudioBase {
    /**
     * @param {AudioContext} context
     * @param {Number} duration
     */
    constructor(context, duration) {
        super(context);
        this._duration = duration;
        this._buffer = this.createEmptyBuffer(duration);
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

    /**
     * Mixes buffer passed in as param into this buffer using the binary operation specified as param
     * @param {SampleBuffer} buffer
     * @param {Function} binaryOp
     */
    mix(buffer, binaryOp = (s1, s2) => s1 + s2) {
        const count = Math.min(buffer.sampleLength, this.sampleLength);
        for(let channelIndex = 0; channelIndex < this._buffer.numberOfChannels; channelIndex++) {
            const channelUs = this._buffer.getChannelData(channelIndex),
                channelThem = (buffer.buffer.numberOfChannels > channelIndex)
                    ? buffer.buffer.getChannelData(channelIndex)
                    : buffer.buffer.getChannelData(0);
            for(let sampleIndex = 0; sampleIndex < count; sampleIndex++) {
                channelUs[sampleIndex] = binaryOp(channelUs[sampleIndex], channelThem[sampleIndex]);
            }
        }
    }

    add(buffer) {
        this.mix(buffer, (s1, s2) => s1 + s2);
    }

    mult(buffer) {
        this.mix(buffer, (s1, s2) =>return s1 * s2);
    }
}

class SineBuffer extends SampleBuffer {
    /**
     * @param {AudioContext} context
     * @param {Number} duration
     * @param {Number} frequency
     * @param {Number} phase
     * @param {Number} amplitude
     */
    constructor(context, duration, frequency, {phase = 0, amplitude = 1}) {
        super(context, duration);
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
    constructor(context, duration, algorithm, {startValue = 0, endValue = 1, startTime = 0}) {
        super(context, duration);
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
        super(context, duration, algorithm, startValue, endValue, startTime);
    }
}

/**
 * An envelope with an exponential shape
 */
class ExponentialEnvelope extends EnvelopeBase {
    constructor(context, duration, {exponent = 2, startValue = 0, endValue = 1, startTime = 0}) {
        const algorithm = (sampleOffset, sampleTotal) => Math.pow(sampleOffset / sampleTotal, exponent);
        super(context, duration, algorithm, startValue, endValue, startTime);
    }
}

module.exports = {
    ExponentialEnvelope,
    LinearEnvelope,
    SineBuffer
};
