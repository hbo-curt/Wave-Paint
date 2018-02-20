/**
 * Models? Just a bunch of shapes that I wanted to drop into a single place. Can
 * be split apart later.
 *
 * I stole a bunch of stuff from index.js
 */

/* eslint-disable */

const assert=require("./assert");

const MixOperation = {
	ADD: "add",
	MULT: "mult"
};

/**
 * Base class for everything that wants to be a buffer
 * @abstract
 */
class SampleBuffer {
	/**
	 * @param {AudioContext} context
	 * @param {Number} duration
	 * @param {Number} channels
	 * @param {String} mixOp
	 */
	constructor(context, duration, {channels = 1, mixOp = MixOperation.ADD}) {
		this._context = context;
		this._duration = duration;
		this._mixOp = (mixOp === MixOperation.ADD)
			? (s1, s2) => s1 + s2
			: (s1, s2) => s1 * s2;
		this._buffer = this._context.createBuffer(channels, this.lengthInSamples, context.sampleRate);
	}

	/**
	 * @returns {AudioBuffer}
	 */
	get buffer() {return this._buffer;}
	/**
	 * @returns {AudioContext}
	 */
	get context() {return this._context;}
	/**
	 * @returns {number}
	 */
	get channelCount() {return this._buffer.numberOfChannels;}

	/**
	 * Total sample length in seconds
	 * @returns {Number}
	 */
	get lengthInSeconds() {return this._duration;}
	/**
	 * Total sample length in samples
	 * @returns {Number}
	 */
	get lengthInSamples() {return this.secondsToSampleOffset(this._duration);}

	/**
	 * @returns {MixOperation}
	 */
	get mixOperation() {return this._mixOp;}

	/**
	 * @returns {number}
	 */
	get sampleRate() {return this._context.sampleRate;}

	secondsToSampleOffset(seconds) {
		return Math.floor(this._context.sampleRate * seconds);
	}

	sampleOffsetToSeconds(sample) {
		return Math.floor(sample / this._context.sampleRate);
	}

	/**
	 * Mixes our instance buffer into the buffer passed in as param. The mix operation is determined by the local <code>mixOperation</code>.
	 * So if mixOperation=="add" then our buffer will be added to his.  If mixOperation=="mult" then it will be multiplied in.
	 * @param {SampleBuffer} targetSampleBuffer
	 */
	mixInto(targetSampleBuffer) {
		const sampleCount = Math.min(targetSampleBuffer.lengthInSamples, this.lengthInSamples);
		for(let channelIndex = 0; channelIndex < targetSampleBuffer.channelCount; channelIndex++) {
			const targetChannelData = targetSampleBuffer._buffer.getChannelData(channelIndex),
				sourceChannelData = (this._buffer.channelCount > channelIndex)
					? this._buffer.getChannelData(channelIndex)
					: this._buffer.getChannelData(0);
			for(let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
				targetChannelData[sampleIndex] = this._mixOp(sourceChannelData[sampleIndex], targetChannelData[sampleIndex]);
			}
		}
	}

	/**** Protected Interface ****/
	_generateBufferData() {
		throw new Error("abstract");
	}

	_clearSampleBuffer() {
		for(let channelIndex = 0; channelIndex < this.channelCount; channelIndex++) {
			this._buffer.getChannelData(channelIndex).fill(0);
		}
	}
}

/**
 * Thin base class for all of our sample buffers that have a frequency
 * @abstract
 */
class FrequencyBuffer extends SampleBuffer {
	/**
	 * @param {AudioContext} context
	 * @param {Number} duration
	 * @param {Number} frequency
	 * @param {Number} channels
	 * @param {Number} phase
	 * @param {Number} amplitude
	 * @param {MixOperation} mixOp
	 */
	constructor(context, duration, frequency, {channels = 1, phase = 0, amplitude = 1, mixOp = MixOperation.ADD}) {
		super(context, duration, {channels, mixOp});
		this._frequency = frequency;
		this._phase = phase;
		this._amplitude = amplitude;
	}

	/**
	 * @returns {Number}
	 */
	get amplitude() {return this._amplitude;}
	/**
	 * @returns {Number}
	 */
	get phase() {return this._phase;}
	/**
	 * @returns {Number}
	 */
	get frequency() {return this._frequency;}
}

/**
 * Sine buffer. By default the mix operation is ADD. If you want it to act like a filter then change it.
 */
class SineBuffer extends FrequencyBuffer {
	constructor(context, duration, frequency, {channels = 1, phase = 0, amplitude = 1, mixOp = MixOperation.ADD}) {
		super(context, duration, frequency, {channels, phase, amplitude, mixOp});
		this._generateBufferData();
	}

	_generateBufferData() {
		for(let channelIndex = 0; channelIndex < this._buffer.numberOfChannels; channelIndex++) {
			const channelData = this._buffer.getChannelData(channelIndex);
			for(let sampleIndex = 0; sampleIndex < this._buffer.length; sampleIndex++) {
				const t = (sampleIndex * Math.PI * 2) / this.sampleRate;
				channelData[sampleIndex] = Math.sin(t * this._frequency + this._phase) * this._amplitude;
			}
		}
	}
}

/**
 * He is the envelope. He requires an algorithm to do the things he needs to get things done.
 * By default he assumes a mix operation of MULT
 */
class EnvelopeBase extends SampleBuffer {
	/**
	 * @param {AudioContext} context
	 * @param {Number} duration
	 * @param {Function} algorithm: (sampleOffset, sampleTotal)=>Number
	 * @param {Number} startValue the starting value of the envelope
	 * @param {Number} endValue the ending value of the envelope
	 * @param {Number} startTime when the envelope should start. Think of it as a delay.
	 * @param {Number} amplitude
	 * @param {MixOperation} mixOp
	 */
	constructor(context, duration, algorithm, {startValue = 0, endValue = 1, startTime = 0, amplitude = 1, mixOp = MixOperation.MULT}) {
		super(context, duration, {amplitude, mixOp});
		this._algorithm = algorithm;
		this._startValue = startValue;
		this._endValue = endValue;
		this._startTime = startTime;
		this._generateBufferData();
	}

	/**
	 * Offset within the wave at which point the envelope will being
	 * @returns {Number}
	 */
	get startTimeInSeconds() {return this._startTime;}
	get startTimeInSamples() {return this.sampleOffsetToSeconds(this._startTime);}

	/**
	 * Normalized ending value for the envelope
	 * @returns {Number}
	 */
	get startValue() {return this._startValue;}
	/**
	 * Normalized starting value for the envelope
	 * @returns {Number}
	 */
	get endValue() {return this._endValue;}

	_generateBufferData() {
		const sampleEnvStart = this.secondsToSampleOffset(this._startTime),
			envelopWidth = (this.lengthInSamples - sampleEnvStart),
			channelData = this._buffer.getChannelData(0);
		for(let index = 0; index < sampleEnvStart; index++) {
			channelData[index] = this._startValue;
		}
		for(let index = sampleEnvStart; index < channelData.length; index++) {
			const multiplier = this._algorithm(index - sampleEnvStart, envelopWidth);
			channelData[index] = this._startValue + multiplier * (this._endValue - this._startValue);
		}
	}
}

/**
 * A linear envelope
 */
class LinearEnvelope extends EnvelopeBase {
	constructor(context, duration, {startValue = 0, endValue = 1, startTime = 0, amplitude = 1, mixOp = MixOperation.MULT}) {
		const algorithm = (sampleOffset, sampleTotal) => sampleOffset / sampleTotal;
		super(context, duration, algorithm, {startValue, endValue, startTime, amplitude, mixOp});
	}
}

/**
 * An envelope with an exponential shape
 */
class ExponentialEnvelope extends EnvelopeBase {
	constructor(context, duration, {exponent = 2, startValue = 0, endValue = 1, startTime = 0, amplitude = 1, mixOp = MixOperation.MULT}) {
		const algorithm = (sampleOffset, sampleTotal) => Math.pow(sampleOffset / sampleTotal, exponent);
		super(context, duration, algorithm, {startValue, endValue, startTime, amplitude, mixOp});
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
		const duration = attack.lengthInSeconds + sustain.lengthInSeconds + release.lengthInSeconds;
		super(attack.context, duration, () => 0, {});
		this._buffer.copyToChannel(attack.buffer.getChannelData(0), 0, 0);
		this._buffer.copyToChannel(sustain.buffer.getChannelData(0), 0, attack.buffer.length);
		this._buffer.copyToChannel(release.buffer.getChannelData(0), 0, attack.buffer.length + sustain.buffer.length);
	}

	/**
	 * @param {EnvelopeBase} attack
	 * @param {EnvelopeBase} release
	 * @param {Number} duration
	 * @returns {ASREnvelope}
	 */
	static createInterpolated(attack, release, duration) {
		const sustainDuration = duration - (attack.lengthInSeconds + release.lengthInSeconds),
			sustain = new LinearEnvelope(attack.context, sustainDuration, {
				startValue: attack.endValue,
				endValue: release.startValue
			});
		return new ASREnvelope(attack, sustain, release);
	}
}

/**
 * Sketch of alan's wave stack.  I made its elements immutable so that we could easily keep track of dirty
 * states and only regenerate the buffer when a waveform has been added, updated or removed.  What can be done?
 *  - May add, update and remove stack elements each of which must be an SampleBuffer
 *  - Can grab the buffer at any time which will always reflect the current state of the whole stack
 *  - see <code>mixInto</code> for details on mixing works.
 */
class WaveStack extends SampleBuffer {
	/**
	 * @param {AudioContext} context
	 * @param {Number} duration
	 * @param {Number} channels
	 */
	constructor(context, duration, {channels = 1}) {
		super(context, duration, {channels});
		this._dirty = false;
		this._stack = [];
	}

	get buffer() {
		if(this._dirty) {
			this._generateBufferData();
		}
		return super.buffer;
	}

	/**
	 * @returns {number}
	 */
	get getStackSampleBufferCount() {
		return this._stack.length;
	}
	/**
	 * @param {Number} index
	 * @returns {SampleBuffer}
	 */
	getStackSampleBuffer(index) {
		return this._stack[index];
	}

	/**
	 * Adds this sample buffer to our stack and invalidates our buffer
	 * @param {SampleBuffer} sampleBuffer
	 * @param {Number} index
	 * @returns {Number} index of the newly inserted sample buffer.
	 */
	addSampleBuffer(sampleBuffer, index = this._stack.length) {
		assert.ok(sampleBuffer instanceof SampleBuffer);
		this._stack.splice(index, 0, sampleBuffer);
		this._dirty = true;
		return index;
	}

	/**
	 * Replaces an existing sample buffer with a new sample buffer
	 * @param {SampleBuffer} oldSampleBuffer
	 * @param {SampleBuffer} newSampleBuffer
	 * @returns {Number} index of the replaced element
	 */
	replaceSampleBuffer(oldSampleBuffer, newSampleBuffer) {
		assert.ok(newSampleBuffer instanceof SampleBuffer);
		const index = this._stack.indexOf(oldSampleBuffer);
		if(index > -1) {
			this._stack[index] = newSampleBuffer;
			this._dirty = true;
			return index;
		} else {
			throw new Error("could not find old sample buffer?");
		}
	}

	/**
	 * Removes the specified sample buffer
	 * @param {SampleBuffer} sampleBuffer
	 * @returns {Number} index of the removed
	 */
	removeSampleBuffer(sampleBuffer) {
		assert.ok(sampleBuffer instanceof SampleBuffer);
		const index = this._stack.indexOf(sampleBuffer);
		if(index > -1) {
			this._stack.splice(index, 1);
			this._dirty = true;
		}
	}

	/**
	 * We override this guy so that we can generate all of our bits and pieces into our buffer
	 * @private
	 */
	_generateBufferData() {
		if(this._dirty) {
			this._clearSampleBuffer();
			for(let index = 0; index < this._stack.length; index++) {
				this._stack[index].mixInto(this);
			}
			this._dirty = false;
		}
	}
}

module.exports = {
	MixOperation,
	ASREnvelope,
	ExponentialEnvelope,
	LinearEnvelope,
	SineBuffer,
	WaveStack,
};
