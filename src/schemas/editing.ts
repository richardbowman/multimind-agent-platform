import { ModelResponse } from "./ModelResponse";

/**
 * Represents a content improvement suggestion
 */
export interface ContentSuggestion {
    /** Type of improvement */
    type: 'clarity' | 'structure' | 'style' | 'grammar';
    /** Original content */
    original: string;
    /** Improved version */
    improved: string;
    /** Explanation of the improvement */
    explanation: string;
}

/**
 * Represents improvements for a content section
 */
export interface SectionImprovement {
    /** Section identifier or name */
    section: string;
    /** List of suggestions for this section */
    suggestions: ContentSuggestion[];
}

/**
 * Response containing content editing suggestions
 */
export interface EditingResponse extends ModelResponse {
    /** Generated title for the content */
    title: string;
    /** List of section-specific improvements */
    improvements: SectionImprovement[];
    /** Overall feedback on the content */
    overallFeedback: string;
}
