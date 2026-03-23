import { useReducer, useCallback, useRef } from 'react';

const MAX_HISTORY = 100;

const initialState = {
  metadata: {
    title: '',
    subtitle: '',
    artist: '',
    music: '',
    offset: 0,
    bpms: [{ beat: 0, bpm: 120 }],
    stops: [],
    samplestart: 0,
    samplelength: 0,
  },
  charts: [],
  activeChartIndex: 0,
  dirty: false,
};

function chartReducer(state, action) {
  switch (action.type) {
    case 'LOAD_FILE': {
      const { metadata, charts } = action.payload;
      return {
        ...state,
        metadata: { ...initialState.metadata, ...metadata },
        charts,
        activeChartIndex: 0,
        dirty: false,
      };
    }

    case 'SET_ACTIVE_CHART':
      return { ...state, activeChartIndex: action.payload };

    case 'UPDATE_METADATA':
      return {
        ...state,
        metadata: { ...state.metadata, ...action.payload },
        dirty: true,
      };

    case 'PLACE_NOTE': {
      const { beat, column, noteType } = action.payload;
      const charts = [...state.charts];
      const chart = { ...charts[state.activeChartIndex] };
      const notes = [...chart.notes];

      // Remove existing note at this position
      const existingIdx = notes.findIndex(
        n => Math.abs(n.beat - beat) < 0.001 && n.column === column
      );
      if (existingIdx >= 0) {
        notes.splice(existingIdx, 1);
      }

      notes.push({ beat, column, type: noteType });
      notes.sort((a, b) => a.beat - b.beat || a.column - b.column);

      chart.notes = notes;
      charts[state.activeChartIndex] = chart;
      return { ...state, charts, dirty: true };
    }

    case 'DELETE_NOTE': {
      const { beat, column } = action.payload;
      const charts = [...state.charts];
      const chart = { ...charts[state.activeChartIndex] };
      const notes = chart.notes.filter(
        n => !(Math.abs(n.beat - beat) < 0.001 && n.column === column)
      );
      chart.notes = notes;
      charts[state.activeChartIndex] = chart;
      return { ...state, charts, dirty: true };
    }

    case 'UPDATE_CHART_META': {
      const charts = [...state.charts];
      charts[state.activeChartIndex] = {
        ...charts[state.activeChartIndex],
        ...action.payload,
      };
      return { ...state, charts, dirty: true };
    }

    case 'ADD_CHART': {
      const newChart = {
        type: action.payload?.type || 'pump-single',
        description: '',
        difficulty: 'Edit',
        meter: 1,
        grooveRadar: '0,0,0,0,0',
        notes: [],
      };
      return {
        ...state,
        charts: [...state.charts, newChart],
        activeChartIndex: state.charts.length,
        dirty: true,
      };
    }

    case 'DELETE_CHART': {
      if (state.charts.length <= 1) return state;
      const charts = state.charts.filter((_, i) => i !== action.payload);
      return {
        ...state,
        charts,
        activeChartIndex: Math.min(state.activeChartIndex, charts.length - 1),
        dirty: true,
      };
    }

    case 'RESTORE':
      return { ...action.payload, dirty: true };

    default:
      return state;
  }
}

export function useChartState() {
  const [state, dispatch] = useReducer(chartReducer, initialState);
  const historyRef = useRef([]);
  const historyIdxRef = useRef(-1);

  const pushHistory = useCallback(() => {
    const snapshot = JSON.parse(JSON.stringify(state));
    // Truncate future history if we're not at the end
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    }
    historyIdxRef.current = historyRef.current.length - 1;
  }, [state]);

  const dispatchWithHistory = useCallback((action) => {
    // Save current state before mutating (for undo)
    if (['PLACE_NOTE', 'DELETE_NOTE', 'UPDATE_CHART_META', 'ADD_CHART', 'DELETE_CHART'].includes(action.type)) {
      pushHistory();
    }
    dispatch(action);
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIdxRef.current < 0) return;
    // Save current state for redo
    if (historyIdxRef.current === historyRef.current.length - 1) {
      historyRef.current.push(JSON.parse(JSON.stringify(state)));
    }
    const snapshot = historyRef.current[historyIdxRef.current];
    historyIdxRef.current--;
    dispatch({ type: 'RESTORE', payload: snapshot });
  }, [state]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 2) return;
    historyIdxRef.current += 2;
    const snapshot = historyRef.current[historyIdxRef.current];
    historyIdxRef.current--;
    dispatch({ type: 'RESTORE', payload: snapshot });
  }, []);

  const activeChart = state.charts[state.activeChartIndex] || null;

  return {
    state,
    activeChart,
    dispatch: dispatchWithHistory,
    rawDispatch: dispatch,
    undo,
    redo,
  };
}
