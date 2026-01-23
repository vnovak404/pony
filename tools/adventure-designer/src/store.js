export function createStore(initialMap) {
  let state = cloneMap(initialMap);

  return {
    getState() {
      return state;
    },
    setState(next) {
      state = cloneMap(next);
    },
    setTile(x, y, tileId) {
      const index = y * state.width + x;
      state.tiles[index] = tileId;
    },
    applyTileEdits(tileEdits) {
      tileEdits.forEach((edit) => {
        const index = edit.y * state.width + edit.x;
        state.tiles[index] = edit.tileId;
      });
    },
    addObject(object) {
      state.objects.push(object);
    },
    removeObjectsAt(cells) {
      if (!Array.isArray(cells) || cells.length === 0) {
        return;
      }
      const removeSet = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
      state.objects = state.objects.filter(
        (object) => !removeSet.has(`${object.x},${object.y}`)
      );
    },
    addRoad(road) {
      state.roads.push(road);
    },
    addRoads(roads) {
      roads.forEach((road) => {
        state.roads.push(road);
      });
    },
    removeRoadPointsAt(cells) {
      if (!Array.isArray(cells) || cells.length === 0) {
        return;
      }
      const removeSet = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
      state.roads = (state.roads || [])
        .map((road) => {
          const points = (road.points || []).filter(
            (point) => !removeSet.has(`${point.x},${point.y}`)
          );
          return { ...road, points };
        })
        .filter((road) => road.points.length >= 2);
    },
    addRiver(river) {
      if (!Array.isArray(state.rivers)) {
        state.rivers = [];
      }
      state.rivers.push(river);
    },
    addRivers(rivers) {
      if (!Array.isArray(state.rivers)) {
        state.rivers = [];
      }
      rivers.forEach((river) => {
        state.rivers.push(river);
      });
    },
    removeRiverPointsAt(cells) {
      if (!Array.isArray(cells) || cells.length === 0) {
        return;
      }
      const removeSet = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
      state.rivers = (state.rivers || [])
        .map((river) => {
          const points = (river.points || []).filter(
            (point) => !removeSet.has(`${point.x},${point.y}`)
          );
          return { ...river, points };
        })
        .filter((river) => river.points.length >= 2);
    }
  };
}

export function cloneMap(map) {
  return JSON.parse(JSON.stringify(map));
}
