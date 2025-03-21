import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useMemo } from 'react';

interface ToolbarAction {
    id: string;
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

interface ToolbarActionsContextType {
    actions: ToolbarAction[];
    registerActions: (source: string, actions: ToolbarAction[]) => void;
    unregisterActions: (source: string) => void;
    updateActionState: (label: string, state: Partial<ToolbarAction>) => void;
}

const ToolbarActionsContext = createContext<ToolbarActionsContextType>({
    actions: [],
    registerActions: () => {},
    unregisterActions: () => {},
    updateActionState: () => {}
});

export const ToolbarActionsProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [actions, setActions] = useState<ToolbarAction[]>([]);
    const actionSources = useRef<Record<string, ToolbarAction[]>>({});
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    const registerActions = useCallback((source: string, newActions: ToolbarAction[]) => {
        // Only update if actions actually changed
        const currentActions = actionSources.current[source];
        if (currentActions && currentActions.length === newActions.length &&
            currentActions.every((a, i) => a.label === newActions[i].label)) {
            return;
        }
        
        actionSources.current[source] = newActions;
        const allActions = Object.values(actionSources.current).flat();
        setActions(allActions);
    }, []);

    const unregisterActions = useCallback((source: string) => {
        if (!actionSources.current[source]) return;
        delete actionSources.current[source];
        const allActions = Object.values(actionSources.current).flat();
        setActions(allActions);
    }, []);

    const updateActionState = useCallback((id: string, state: Partial<ToolbarAction>) => {
        setActions(prev => {
            const newActions = prev.map(action => 
                action.id === id ? { ...action, ...state } : action
            );
            // Only update if state actually changed
            if (prev.some((a, i) => a.disabled !== newActions[i].disabled || a.label !== newActions[i].label)) {
                return newActions;
            }
            return prev;
        });
    }, []);

    const value : ToolbarActionsContextType = useMemo(() => ({
        actions, registerActions, unregisterActions, updateActionState
    }), [actions, registerActions, unregisterActions, updateActionState]);

    return (
        <ToolbarActionsContext.Provider value={value}>
            {children}
        </ToolbarActionsContext.Provider>
    );
};

export const useToolbarActions = () => useContext(ToolbarActionsContext);
