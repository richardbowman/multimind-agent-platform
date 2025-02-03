import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { EventEmitter } from 'events';

interface ToolbarAction {
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

    const registerActions = useCallback((source: string, newActions: ToolbarAction[]) => {
        actionSources.current[source] = newActions;
        setActions(Object.values(actionSources.current).flat());
    }, []);

    const unregisterActions = useCallback((source: string) => {
        delete actionSources.current[source];
        setActions(Object.values(actionSources.current).flat());
    }, []);

    const updateActionState = useCallback((label: string, state: Partial<ToolbarAction>) => {
        setActions(prev => prev.map(action => 
            action.label === label ? { ...action, ...state } : action
        ));
    }, []);

    return (
        <ToolbarActionsContext.Provider
            value={{ actions, registerActions, unregisterActions, updateActionState }}
        >
            {children}
        </ToolbarActionsContext.Provider>
    );
};

export const useToolbarActions = () => useContext(ToolbarActionsContext);
