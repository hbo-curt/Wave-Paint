/* eslint-disable */

const {Display} = require('./display');
const {Audio} = require('./audio');
const {mouse, keys} = require('gocanvas');
const noise = require('./perlin');
const {SineBuffer, ASREnvelope, ExponentialEnvelope, LinearEnvelope} = require("./models");

const createEmptyBuffer = (audioCtx, seconds) => {
	return audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate);
};

const getAudioData = (ac, url) => {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';

	return new Promise((resolve, reject) => {
		request.onload = function() {
			var audioData = request.response;
			ac.decodeAudioData(audioData)
				.then((buffer) => {
					resolve(buffer);
				})
				.catch( e => {
					reject(e.err);
				});
		}

		request.send();
	});
};
/** must have same number of channels, samplerate, and length */
const sum = (audioCtx, buffer1, buffer2) => {
	const totalSeconds = buffer1.duration;
	const sum = createEmptyBuffer(audioCtx, totalSeconds);

	for (let channel = 0; channel < buffer1.numberOfChannels; channel++) {
		const sumBuffering = sum.getChannelData(channel);
		var nowBuffering1 = buffer1.getChannelData(channel);
		var nowBuffering2 = buffer2.getChannelData(channel);
		for (let i = 0; i < sumBuffering.length; i++) {
			sumBuffering[i] = nowBuffering1[i] + nowBuffering2[i];
		}
	}
	
	return sum;
};

const interpolate = (audioCtx, buffer1, buffer2, timeSpan, blendLeft, blendRight) => {
	const totalSeconds = buffer1.duration;
	const merge = createEmptyBuffer(audioCtx, totalSeconds);
	const sampleRate = 1/merge.sampleRate;

	for (let channel = 0; channel < buffer1.numberOfChannels; channel++) {
		const mergeBuffering = merge.getChannelData(channel);
		var nowBuffering1 = buffer1.getChannelData(channel);
		var nowBuffering2 = buffer2.getChannelData(channel);
		for (let i = 0; i < mergeBuffering.length; i++) {
			const t = i*sampleRate;
			const z = t/timeSpan > 1 ? 1 : t/timeSpan;
			mergeBuffering[i] = (1-z)*nowBuffering1[i]*blendLeft + z*nowBuffering2[i]*blendRight;
		}
	}
	
	return merge;
};

const product = (audioCtx, buffer1, buffer2) => {
	const totalSeconds = buffer1.duration;
	const sum = createEmptyBuffer(audioCtx, totalSeconds);

	for (let channel = 0; channel < buffer1.numberOfChannels; channel++) {
		const sumBuffering = sum.getChannelData(channel);
		var nowBuffering1 = buffer1.getChannelData(channel);
		var nowBuffering2 = buffer2.getChannelData(channel);
		for (let i = 0; i < sumBuffering.length; i++) {
			sumBuffering[i] = nowBuffering1[i] * nowBuffering2[i];
		}
	}
	
	return sum;
};

const createPerlinBuffer = (audioCtx, seed, factor, slice, seconds) => {
	noise.seed(seed);
	
	const perlin = createEmptyBuffer(audioCtx, seconds);
	const sampleRate = 1/perlin.sampleRate;
	for (let channel = 0; channel < perlin.numberOfChannels; channel++) {		
		const perlinBuffer = perlin.getChannelData(channel);
		for (let i = 0; i < perlinBuffer.length; i++) {
			const t = i*sampleRate*Math.PI*2;
			const v = noise.perlin2(t/(sampleRate*factor), slice);
			perlinBuffer[i] = v;
		}
		// console.log(perlinBuffer);
	}
	
	return perlin;
};

const linearGain = (audioCtx, from, to, duration, totalSeconds) => {
	const buffer = createEmptyBuffer(audioCtx, totalSeconds);
	
	const sampleTo = Math.floor(duration*buffer.sampleRate);
	const m = (to-from)/sampleTo;
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var myArrayBuffer = buffer.getChannelData(channel);
		for (var i = 0; i < myArrayBuffer.length; i++) {
			const val = from + m*i;
			if(i >= sampleTo) {
				myArrayBuffer[i] = to;
			} else {
				myArrayBuffer[i] = val;
			}
		}
	}
	
	return buffer;
};

const createNoiseBuffer = (audioCtx, seconds) => {
	var myArrayBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate);

	for (var channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {
		var nowBuffering = myArrayBuffer.getChannelData(channel);
		for (var i = 0; i < myArrayBuffer.length; i++) {
			nowBuffering[i] = Math.random() * .2 - 1;
		}
	}
	
	return myArrayBuffer;
}

const createOscillatorBuffer = (audioCtx, freq, phase, amp, seconds) => {
	var myArrayBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate);
	const sampleRate = 1/audioCtx.sampleRate;

	for (var channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {

		var nowBuffering = myArrayBuffer.getChannelData(channel);
		for (var i = 0; i < myArrayBuffer.length; i++) {
			const t = i*sampleRate*Math.PI*2;
			const sample = Math.sin(t*freq + phase)*amp;
			nowBuffering[i] = sample;
		}
	}
	
	return myArrayBuffer;
};

noise.seed(321);

// var canvas = document.getElementById("display");
var canvas = document.querySelector("#wave-1 canvas");

const totalSeconds = 2;
var actx = new (window.AudioContext || window.webkitAudioContext)();
const audio = new Audio(actx);

getAudioData(actx, './A4.mp3').then(buffer => {
    buffer = curtF440.buffer;
	const mainDisplay = new Display(canvas);
	const currRenderState = {tMin: 0.00, tMax: buffer.duration, yScale: 3}
	mainDisplay.renderBuffer(buffer, currRenderState);

    const A4 = createOscillatorBuffer(actx, 440, 0, .2, buffer.duration);
	const slot2 = document.querySelector('#wave-2 canvas');
	const slot2Display = new Display(slot2);
	slot2Display.renderBuffer(A4, {tMin: 0, tMax: .02});

	document.querySelector('#play-reference').onclick = () => {
        audio.play(buffer);
    };

    keys(document).subscribe(evt => {
		const {key, dt, event} = evt;
		const timeSpan = currRenderState.tMax - currRenderState.tMin;

		switch(key) {
			case 'a': {
				if(event === 'held') {
					currRenderState.tMin -= dt * timeSpan;
                    currRenderState.tMax -= dt * timeSpan;
                }
            } break;
            case 'd': {
                if(event === 'held') {
                    currRenderState.tMin += dt * timeSpan;
                    currRenderState.tMax += dt * timeSpan;
                }
            } break;
            case 'w': {
                if(event === 'held') {
                    currRenderState.tMin += dt * timeSpan;
                    currRenderState.tMax -= dt * timeSpan;
                }
            } break;
            case 's': {
                if(event === 'held') {
                    currRenderState.tMin -= dt * timeSpan;
                    currRenderState.tMax += dt * timeSpan;
                }
            } break;
			default:
				break;
        };
        mainDisplay.renderBuffer(buffer, currRenderState);
	});

    mouse(canvas).subscribe(evt => {
		const {type, pos} = evt;
		const {width, height} = canvas;
		const {tMin, tMax} = currRenderState;
		const tWidth = tMax - tMin;
		const t = tMin + (pos.x / width) * tWidth;
		// console.log(evt, type);
		switch(type) {
			case 'drag': {
                currRenderState.selectedtMax = t;
			} break;
			case 'press': {
				currRenderState.selectedtMin = t;
			} break;
			case 'release': {
				// prevents zooming in without there actually being a timeRange === 0
				if(currRenderState.selectedtMin !== t) {
                    currRenderState.tMin = currRenderState.selectedtMin;
                    currRenderState.tMax = t;

                    delete currRenderState.selectedtMin;
                    delete currRenderState.selectedtMax;
                }
			} break;
			default:
				break;
		}
        mainDisplay.renderBuffer(buffer, currRenderState);
    });

    audio.play(buffer);
});

const noisey = createNoiseBuffer(actx, totalSeconds);
const A4 = createOscillatorBuffer(actx, 440, 0, .2, totalSeconds);
const A5 = createOscillatorBuffer(actx, 440*2, Math.PI/2 * .75, .2, totalSeconds);
const A4n5 = sum(actx, A4, A5);
const perlin = createPerlinBuffer(actx, 30, 40, .3, totalSeconds);
const decay = linearGain(actx, 0, .75, 0.006, totalSeconds);

const fused = product(actx, decay, perlin);
const summed = sum(actx, perlin, A5);
const inter = interpolate(actx, perlin, decay, .03, .1, 1);
const inter2 = interpolate(actx, perlin, A4n5, .03, 1, 1);
const instru = product(actx, inter, A4n5);

const curtF440=new SineBuffer(actx, totalSeconds, 440, {});
const curtLFO=new SineBuffer(actx, totalSeconds, 11, {});
const curtLinearEnv=new LinearEnvelope(actx, totalSeconds, {});
const curt2xExp=new ExponentialEnvelope(actx, totalSeconds, {});
const curtLoggish=new ExponentialEnvelope(actx, totalSeconds, {exponent: 0.5});
const curtADR=ASREnvelope.createInterpolated(
    new ExponentialEnvelope(actx, 0.3, {}),
    new LinearEnvelope(actx, 0.5, {startValue:0.7, endValue:0.1}),
	totalSeconds
);
curtF440.mult(curtLFO);
curtF440.mult(curtADR);
