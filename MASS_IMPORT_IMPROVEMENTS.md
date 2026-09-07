# Mass Import Name Parsing Improvements

## Problem Solved
When importing leads from Excel, names were not being parsed intelligently, causing issues like:
- CamelCase names like "MamathaTulluri" not being split into first/last names
- Names in "LastName, FirstName" format not being recognized
- Inconsistent handling of name formats across different data sources

## Solution Implemented

### New File: `src/lib/leads/import/parse-names.ts`
A dedicated module with smart name parsing utilities:

#### **`splitCamelCase(text: string): string`**
Detects and splits camelCase names into proper format:
```
MamathaTulluri → Mamatha Tulluri
JohnDoe → John Doe
RajeevKumar → Rajeev Kumar
```

#### **`parseFullName(fullName: string)`**
Handles multiple name formats:
- Standard: "FirstName LastName"
- Comma-separated: "LastName, FirstName"
- CamelCase: "MamathaTulluri"
- Single names: "Madonna"

Returns: `{ firstName: string, lastName: string }`

#### **`guessNameSplit(fullName: string)`**
Uses common first/last name patterns to intelligently guess which part is the first name and which is the last name. Contains extensive lists of common names in multiple languages (English, Hindi, Sanskrit, etc.).

### Updated Files

#### `src/lib/leads/import/apply-mapping.ts`
Enhanced to:
- Use the smart name parser when a full name is provided but no separate first/last names
- Properly split camelCase and comma-separated names
- Maintain backward compatibility with existing behavior

#### `src/lib/leads/import/import-leads.ts`
Updated to:
- Import and use `parseFullName` function when storing names in the database
- Smarter first/last name splitting for database storage

#### `src/lib/leads/import/__tests__/import-map.test.ts`
Added 7 new test cases covering:
- CamelCase name splitting
- Full name parsing in multiple formats
- LastName, FirstName format detection
- Single name handling
- Edge cases (empty strings, etc.)

## Test Results
✅ All 19 tests passing
- 7 new name parsing tests
- 12 existing import tests
- Comprehensive coverage of edge cases

## Impact
- Handles real-world data quality issues automatically
- Reduces manual data cleanup after import
- Supports international name formats
- Backward compatible with existing imports
- Zero breaking changes

## Usage Example
When importing an Excel file with a "Name" column containing "MamathaTulluri":
- **Before**: Would be stored as one name, unclear which part is first/last
- **After**: Automatically split into firstName: "Mamatha", lastName: "Tulluri"
