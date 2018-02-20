/* eslint-disable */

module.exports = {
	ok(condition, message="[no message]") {
		if(!condition) {
			throw new Error(`assert failed: ${message}`);
		}
	}
};
