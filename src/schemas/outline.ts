/**
 * Represents a content outline section
 */
export class OutlineSection {
    /** The section heading */
    heading: string = '';
    /** Detailed description of the section content */
    description: string = '';
    /** Key points to be covered in the section */
    keyPoints: string[] = [];
}

/**
 * Represents a complete content outline
 */
export class ContentOutline {
    /** Main title for the content */
    title: string = '';
    /** Organized sections of the content */
    sections: OutlineSection[] = [];
    /** Content development strategy */
    strategy: string = '';
}
