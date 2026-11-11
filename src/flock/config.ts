import { movementConfig } from '../config/movement';
import type { MovementConfig } from '../config/movement';

/**
 * The movement rules the lobby's parrots fly by. They are the same rules as
 * the player's, but with their own copy of the values, fixed at those their
 * flying was tuned against. So tuning how flying feels for the player, from
 * the debug panel or in the config, never upsets the flock.
 */
export const flockConfig: MovementConfig = structuredClone(movementConfig);

flockConfig.flapSpeedThreshold.value = 1.5;
flockConfig.flapSyncWindow.value = 150;
flockConfig.flapPower.value = 13;
flockConfig.glideSinkRate.value = 1;
flockConfig.flapsPerFullStamina.value = 12;
