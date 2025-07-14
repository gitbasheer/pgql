import csv
import re
import sys

# Configuration - adjust these based on your CSV columns
CONFIG = {
    'csv_file': 'wam-general-Jun 30, 2025, 11_50 AM.csv',
    'output_file': 'graphql-queries.mmd',
    'rad_name_column': 'radConfig.name',  # Column containing RAD names
    'query_column': 'radContent.synthesize.rule',  # Column containing GraphQL queries in JavaScript
    'rad_id_column': 'radContent.id',  # Column containing RAD IDs
}

def extract_pure_graphql(query_string):
    """Return the full JavaScript code as-is."""
    if not query_string:
        return None
    
    # Just return the original JavaScript code after basic cleanup
    return query_string.strip().strip('"\'').strip()

def format_graphql_for_mermaid(graphql):
    """Format GraphQL for Mermaid diagram."""
    if not graphql:
        return ''
    
    # Escape special characters for Mermaid
    formatted = graphql.replace('"', '\\"')
    formatted = formatted.replace('\n', '<br/>')
    formatted = re.sub(r'\s+', ' ', formatted)
    return formatted.strip()

def convert_to_mermaid():
    """Main function to convert CSV to Mermaid."""
    try:
        # Read CSV file
        with open(CONFIG['csv_file'], 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            rows = list(reader)
            
            # Log available columns
            if rows:
                print(f"Available columns: {list(rows[0].keys())}")
                print(f"Total rows: {len(rows)}")
            
            # Start building Mermaid diagram
            mermaid_content = 'graph TD\n'
            query_count = 0
            
            # Process each row
            for index, row in enumerate(rows):
                rad_name = row.get(CONFIG['rad_name_column'], f'Query_{index + 1}')
                query_content = row.get(CONFIG['query_column'])
                
                if query_content:
                    pure_graphql = extract_pure_graphql(query_content)
                    
                    if pure_graphql:
                        query_count += 1
                        node_id = f'Q{query_count}'
                        formatted_query = format_graphql_for_mermaid(pure_graphql)
                        
                        # Add node with rad name as title and GraphQL as content
                        mermaid_content += f'    {node_id}["<b>{rad_name}</b><br/><br/>{formatted_query}"]\n'
                        
                        # Add styling
                        mermaid_content += f'    style {node_id} fill:#f9f9f9,stroke:#333,stroke-width:2px\n'
            
            # Create alternative format
            alternative_content = '```mermaid\ngraph LR\n'
            query_count_alt = 0
            
            for index, row in enumerate(rows):
                rad_name = row.get(CONFIG['rad_name_column'], f'Query_{index + 1}')
                query_content = row.get(CONFIG['query_column'])
                
                if query_content:
                    pure_graphql = extract_pure_graphql(query_content)
                    
                    if pure_graphql:
                        query_count_alt += 1
                        alternative_content += f'\n    subgraph {rad_name}\n'
                        alternative_content += f'        {query_count_alt}["`{pure_graphql}`"]\n'
                        alternative_content += '    end\n'
            
            alternative_content += '```\n'
            
            # Create simple format
            simple_format = '# RAD Queries\n\n'
            
            for index, row in enumerate(rows):
                rad_name = row.get(CONFIG['rad_name_column'], f'Query_{index + 1}')
                rad_id = row.get(CONFIG['rad_id_column'], '')
                query_content = row.get(CONFIG['query_column'])
                
                if query_content:
                    pure_graphql = extract_pure_graphql(query_content)
                    
                    if pure_graphql:
                        # Use RAD ID if available, otherwise just name
                        title = f'{rad_id}' if rad_id else rad_name
                        simple_format += f'## {title}\n\n'
                        simple_format += '```javascript\n'
                        simple_format += pure_graphql
                        simple_format += '\n```\n\n'
            
            # Write output files
            with open(CONFIG['output_file'], 'w', encoding='utf-8') as f:
                f.write(mermaid_content)
            
            with open(CONFIG['output_file'].replace('.mmd', '-alternative.mmd'), 'w', encoding='utf-8') as f:
                f.write(alternative_content)
            
            with open(CONFIG['output_file'].replace('.mmd', '-simple.md'), 'w', encoding='utf-8') as f:
                f.write(simple_format)
            
            print(f"Successfully processed {query_count} GraphQL queries")
            print("Output files created:")
            print(f"- {CONFIG['output_file']} (Mermaid diagram)")
            print(f"- {CONFIG['output_file'].replace('.mmd', '-alternative.mmd')} (Alternative Mermaid format)")
            print(f"- {CONFIG['output_file'].replace('.mmd', '-simple.md')} (Simple markdown format)")
            
    except FileNotFoundError:
        print(f"Error: File not found: {CONFIG['csv_file']}")
    except Exception as e:
        print(f"Error processing CSV: {e}")

if __name__ == "__main__":
    # Allow command line arguments for column names
    if len(sys.argv) > 1:
        CONFIG['rad_name_column'] = sys.argv[1]
    if len(sys.argv) > 2:
        CONFIG['query_column'] = sys.argv[2]
    
    convert_to_mermaid()