export interface DocumentSection {
    /**
     * ID of the section matching the template
     */
    id: string;

    /**
     * Generated content for this section
     */
    content: string;

    /**
     * Status of the section completion
     */
    status: 'complete' | 'incomplete';

    /**
     * Any notes about the section content
     */
    notes?: string;
}

export interface DocumentPlanResponse {
    /**
     * Array of completed sections
     */
    sections: DocumentSection[];

    /**
     * Overall status of the document
     */
    status: 'complete' | 'in-progress';

    /**
     * Summary of the document content
     */
    summary: string;

    /**
     * Any additional notes about the document
     */
    notes?: string;
}