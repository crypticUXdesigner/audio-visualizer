// Beat Detection Module
// Common beat detection utilities for shaders
// Provides functions to detect recent bass/mid beats

#ifndef BEAT_DETECTION_GLSL
#define BEAT_DETECTION_GLSL

#include "common/uniforms.glsl"

// Default beat detection constants (can be overridden by shaders)
#ifndef BEAT_TIME_THRESHOLD
#define BEAT_TIME_THRESHOLD 0.25      // Time window for recent beat detection (seconds)
#endif

#ifndef BEAT_INTENSITY_THRESHOLD
#define BEAT_INTENSITY_THRESHOLD 0.5  // Minimum intensity to trigger beat
#endif

/**
 * Check if a recent bass beat has been detected
 * 
 * @param timeThreshold - Time window for recent beat detection (default: BEAT_TIME_THRESHOLD)
 * @param intensityThreshold - Minimum intensity to trigger beat (default: BEAT_INTENSITY_THRESHOLD)
 * @returns true if recent bass beat detected, false otherwise
 */
bool hasBassBeat(float timeThreshold, float intensityThreshold) {
    return (uBeatTimeBass < timeThreshold && uBeatIntensityBass > intensityThreshold);
}

/**
 * Check if a recent mid beat has been detected
 * 
 * @param timeThreshold - Time window for recent beat detection (default: BEAT_TIME_THRESHOLD)
 * @param intensityThreshold - Minimum intensity to trigger beat (default: BEAT_INTENSITY_THRESHOLD)
 * @returns true if recent mid beat detected, false otherwise
 */
bool hasMidBeat(float timeThreshold, float intensityThreshold) {
    return (uBeatTimeMid < timeThreshold && uBeatIntensityMid > intensityThreshold);
}

/**
 * Check if any recent beat (bass or mid) has been detected
 * 
 * @param timeThreshold - Time window for recent beat detection (default: BEAT_TIME_THRESHOLD)
 * @param intensityThreshold - Minimum intensity to trigger beat (default: BEAT_INTENSITY_THRESHOLD)
 * @returns true if any recent beat detected, false otherwise
 */
bool hasAnyBeat(float timeThreshold, float intensityThreshold) {
    return hasBassBeat(timeThreshold, intensityThreshold) || hasMidBeat(timeThreshold, intensityThreshold);
}

/**
 * Check if a recent bass beat has been detected (using default thresholds)
 * 
 * @returns true if recent bass beat detected, false otherwise
 */
bool hasBassBeat() {
    return hasBassBeat(BEAT_TIME_THRESHOLD, BEAT_INTENSITY_THRESHOLD);
}

/**
 * Check if a recent mid beat has been detected (using default thresholds)
 * 
 * @returns true if recent mid beat detected, false otherwise
 */
bool hasMidBeat() {
    return hasMidBeat(BEAT_TIME_THRESHOLD, BEAT_INTENSITY_THRESHOLD);
}

/**
 * Check if any recent beat (bass or mid) has been detected (using default thresholds)
 * 
 * @returns true if any recent beat detected, false otherwise
 */
bool hasAnyBeat() {
    return hasAnyBeat(BEAT_TIME_THRESHOLD, BEAT_INTENSITY_THRESHOLD);
}

#endif

