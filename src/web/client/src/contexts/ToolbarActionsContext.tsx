import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ToolbarAction {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

interface ToolbarActionsContextType {
    actions: ToolbarAction[];
    setActions: (actions: ToolbarAction[]) => void;
    addActions: (actions: ToolbarAction[]) => void;
    resetActions: () => void;
}

const ToolbarActionsContext = createContext<ToolbarActionsContextType>({
    actions: [],
    setActions: () => {},
    addActions: () => {},
    resetActions: () => {}
});

export const ToolbarActionsProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [actions, setActions] = useState<ToolbarAction[]>([]);

    const addActions = (newActions: ToolbarAction[]) => {
        setActions(prev => [
            ...prev.filter(prevAction =>
                !newActions.some(newAction => newAction.label === prevAction.label)
            ),
            ...newActions
        ]);
    };

    const resetActions = () => setActions([]);

    return (
        <ToolbarActionsContext.Provider
            value={{ actions, setActions, addActions, resetActions }}
        >
            {children}
        </ToolbarActionsContext.Provider>
    );
};

export const useToolbarActions = () => useContext(ToolbarActionsContext);