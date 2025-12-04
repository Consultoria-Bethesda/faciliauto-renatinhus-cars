/**
 * Phone Masking Utility
 * 
 * Masks middle digits of phone numbers for privacy in API responses.
 * Format: XX X****-XXXX (Brazilian phone format)
 * 
 * _Requirements: 7.6_
 */

/**
 * Mask middle digits of a phone number
 * Input formats supported:
 * - +55 11 99999-9999
 * - 5511999999999
 * - 11999999999
 * - (11) 99999-9999
 * 
 * Output format: XX X****-XXXX
 * 
 * @param phone - The phone number to mask
 * @returns Masked phone number in format XX X****-XXXX
 */
export function maskPhone(phone: string): string {
    if (!phone) {
        return '';
    }

    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Handle different lengths
    // Brazilian phones: country code (55) + area code (2) + number (8-9)
    // Minimum expected: 10 digits (area + number)
    // Maximum expected: 13 digits (country + area + number)

    if (digits.length < 10) {
        // Too short to mask properly, return partially masked
        if (digits.length <= 4) {
            return '****';
        }
        const first = digits.slice(0, 2);
        const last = digits.slice(-2);
        return `${first} ****-${last}`;
    }

    // Extract parts based on length
    let areaCode: string;
    let lastFour: string;

    if (digits.length >= 12) {
        // Has country code: 55 11 99999-9999
        areaCode = digits.slice(2, 4); // Area code after country code
        lastFour = digits.slice(-4);
    } else {
        // No country code: 11 99999-9999
        areaCode = digits.slice(0, 2);
        lastFour = digits.slice(-4);
    }

    // Format: XX X****-XXXX
    return `${areaCode} *****-${lastFour}`;
}

/**
 * Apply phone masking to a lead object
 * Returns a new object with customerPhone masked
 */
export function maskLeadPhone<T extends { customerPhone: string }>(lead: T): T {
    return {
        ...lead,
        customerPhone: maskPhone(lead.customerPhone),
    };
}

/**
 * Apply phone masking to an array of leads
 */
export function maskLeadsPhones<T extends { customerPhone: string }>(leads: T[]): T[] {
    return leads.map(maskLeadPhone);
}
