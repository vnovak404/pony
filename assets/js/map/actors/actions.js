// Pony Parade: task action orchestration.

import { createNeedActions } from "./actions-needs.js";
import { createWorkActions } from "./actions-work.js";
import { createRestActions } from "./actions-rest.js";

export const createActionHandlers = (context) => {
  const needActions = createNeedActions(context);
  const workActions = createWorkActions(context);
  const restActions = createRestActions(context);

  const handleActorActions = (actor, now, position, vfxByKey, vfxVideos) => {
    const startedEating = needActions.handleEatTask(actor, now, position, vfxByKey, vfxVideos);
    const startedDrinking = needActions.handleDrinkTask(actor, now, position);
    const startedFun = needActions.handleFunTask(actor, now, position);
    const startedWorking =
      workActions.handleRestockTask(actor, now, position) ||
      workActions.handleSupplyTask(actor, now, position) ||
      workActions.handleRepairPickupTask(actor, now, position) ||
      workActions.handleWorkTask(actor, now, position);
    const startedHealing = needActions.handleVetTask(actor, now, position);
    const flags = {
      startedEating,
      startedDrinking,
      startedFun,
      startedWorking,
      startedHealing,
      startedRepairing: false,
    };
    restActions.handleInnRest(actor, now, position, flags);
    restActions.handleHomeRest(actor, now, position, flags);
    flags.startedRepairing = workActions.handleRepairTask(actor, now, position);
    return flags;
  };

  return { handleActorActions };
};
