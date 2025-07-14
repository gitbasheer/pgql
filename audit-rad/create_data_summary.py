#!/usr/bin/env python3
"""
Create a visual summary of unique data fields with better organization
"""

import json
import argparse
from collections import defaultdict, Counter

def create_visual_summary(json_report_path: str):
    """Create a more visual and organized summary"""
    
    with open(json_report_path, 'r') as f:
        report = json.load(f)
    
    # Collect all field usage
    field_usage = Counter()
    field_categories = defaultdict(set)
    field_entity_map = defaultdict(set)
    synthesizer_count = len(report['synthesizer_details'])
    
    for synth in report['synthesizer_details']:
        for field_access in synth['field_accesses']:
            field = field_access['normalized']
            entity = field_access['entity_type']
            
            field_usage[field] += 1
            field_entity_map[field].add(entity)
            
            # Better categorization
            if 'account' in field.lower() or field in ['id', 'type']:
                field_categories['Core Identity'].add(field)
            elif any(x in field for x in ['billing', 'payment', 'commitment', 'autoRenew']):
                field_categories['Billing & Payments'].add(field)
            elif any(x in field for x in ['entitlement', 'current.']):
                field_categories['Feature Entitlements'].add(field)
            elif any(x in field for x in ['website', 'published', 'widget', 'domain']):
                field_categories['Website Settings'].add(field)
            elif any(x in field for x in ['facebook', 'instagram', 'social', 'gem', 'email']):
                field_categories['Marketing & Social'].add(field)
            elif any(x in field for x in ['product', 'commerce', 'ols', 'marketplace']):
                field_categories['E-commerce'].add(field)
            elif any(x in field for x in ['appointment', 'ola', 'service', 'calendar']):
                field_categories['Appointments'].add(field)
            elif any(x in field for x in ['customer', 'contact', 'intention']):
                field_categories['Customer Data'].add(field)
            elif field.startswith('links.'):
                field_categories['Navigation Links'].add(field)
            else:
                field_categories['Other Data'].add(field)
    
    # Generate visual summary
    output = "# RAD Data Usage - Visual Summary\n\n"
    output += f"Analyzing **{synthesizer_count} synthesizers** using **{len(field_usage)} unique data fields**\n\n"
    
    # Most common data - visual bar chart
    output += "## 📊 Most Commonly Used Data\n\n"
    output += "```\n"
    max_count = max(field_usage.values())
    for field, count in field_usage.most_common(20):
        percentage = (count / synthesizer_count) * 100
        bar_length = int((count / max_count) * 40)
        bar = '█' * bar_length
        output += f"{field:<35} {bar} {count:3d} ({percentage:3.0f}%)\n"
    output += "```\n\n"
    
    # Category breakdown with emoji icons
    category_icons = {
        'Core Identity': '🔑',
        'Billing & Payments': '💳',
        'Feature Entitlements': '🎫',
        'Website Settings': '🌐',
        'Marketing & Social': '📱',
        'E-commerce': '🛒',
        'Appointments': '📅',
        'Customer Data': '👤',
        'Navigation Links': '🔗',
        'Other Data': '📦'
    }
    
    output += "## 📂 Data Categories Overview\n\n"
    
    # Sort categories by total usage
    category_usage = {}
    for cat, fields in field_categories.items():
        total = sum(field_usage[f] for f in fields)
        category_usage[cat] = (len(fields), total)
    
    sorted_cats = sorted(category_usage.items(), key=lambda x: x[1][1], reverse=True)
    
    for category, (field_count, total_usage) in sorted_cats:
        icon = category_icons.get(category, '📄')
        avg_usage = total_usage / field_count if field_count > 0 else 0
        output += f"### {icon} {category}\n"
        output += f"- **{field_count} unique fields** | **{total_usage} total uses** | **{avg_usage:.1f} avg uses/field**\n\n"
        
        # Show top fields in category
        cat_fields = [(f, field_usage[f]) for f in field_categories[category]]
        cat_fields.sort(key=lambda x: x[1], reverse=True)
        
        output += "| Field | Usage | Synthesizers |\n"
        output += "|-------|-------|-------------|\n"
        
        for field, count in cat_fields[:5]:
            entities = ', '.join(sorted(field_entity_map[field]))
            output += f"| `{field}` | {count} | {entities} |\n"
        
        if len(cat_fields) > 5:
            output += f"| ... +{len(cat_fields) - 5} more fields | | |\n"
        
        output += "\n"
    
    # Common data patterns
    output += "## 🔄 Common Data Access Patterns\n\n"
    
    # Find synthesizers that use similar data
    synth_fields = defaultdict(set)
    for synth in report['synthesizer_details']:
        name = synth['name']
        for field_access in synth['field_accesses']:
            synth_fields[name].add(field_access['normalized'])
    
    # Identify common patterns
    patterns = {
        'Basic Website Info': {'accountId', 'features.published', 'features.websiteType'},
        'E-commerce Setup': {'accountId', 'entitlementData', 'ols.products.count', 'links.olsAddProducts'},
        'Social Media': {'accountId', 'features.facebook.pageId', 'gem.lastFbPostDate', 'gem.lastIgPostDate'},
        'Appointments': {'accountId', 'ola.service.total', 'ola.account.status', 'entitlementData'},
        'Billing Check': {'accountId', 'vnextAccount.billing.commitment', 'vnextAccount.account.paymentStatus'},
        'Marketing Email': {'accountId', 'gem.subscriberCount', 'gem.hasSent', 'links.composeCampaign'},
    }
    
    for pattern_name, pattern_fields in patterns.items():
        matching_synths = []
        for synth, fields in synth_fields.items():
            if pattern_fields.issubset(fields):
                matching_synths.append(synth)
        
        if matching_synths:
            output += f"### {pattern_name}\n"
            output += f"**{len(matching_synths)} synthesizers** use this data combination:\n"
            output += "- Fields: " + ", ".join(f"`{f}`" for f in sorted(pattern_fields)) + "\n"
            output += f"- Examples: {', '.join(matching_synths[:3])}"
            if len(matching_synths) > 3:
                output += f" (+{len(matching_synths) - 3} more)"
            output += "\n\n"
    
    # Data sharing matrix
    output += "## 🔗 Most Shared Data Fields\n\n"
    output += "Fields used by 10+ synthesizers (strong indicators of core data):\n\n"
    
    shared_fields = [(f, c) for f, c in field_usage.items() if c >= 10]
    shared_fields.sort(key=lambda x: x[1], reverse=True)
    
    output += "```mermaid\ngraph LR\n"
    for i, (field, count) in enumerate(shared_fields[:10]):
        size = "large" if count > 50 else "medium" if count > 20 else "small"
        output += f"    F{i}[\"{field}<br/>{count} uses\"]\n"
        output += f"    style F{i} fill:#"
        if count > 50:
            output += "ff6b6b"  # Red for high usage
        elif count > 20:
            output += "4ecdc4"  # Green for medium usage  
        else:
            output += "95e1d3"  # Blue for lower usage
        output += "\n"
    output += "```\n\n"
    
    # Recommendations
    output += "## 💡 Key Insights\n\n"
    
    # Most critical fields
    critical_fields = [f for f, c in field_usage.items() if c > synthesizer_count * 0.5]
    if critical_fields:
        output += f"### Critical Data (used by >50% of synthesizers)\n"
        for field in sorted(critical_fields):
            percentage = (field_usage[field] / synthesizer_count) * 100
            output += f"- `{field}` - {percentage:.0f}% of synthesizers\n"
        output += "\n"
    
    # Rarely used fields
    rare_fields = [f for f, c in field_usage.items() if c == 1]
    if rare_fields:
        output += f"### Rarely Used Data ({len(rare_fields)} fields used by only 1 synthesizer)\n"
        output += "Consider if these are still needed or can be consolidated.\n\n"
    
    # Field variations
    variations = report['field_analysis']['field_variations']
    high_variation = [(f, len(v)) for f, v in variations.items() if len(v) > 2]
    if high_variation:
        output += "### Fields with Multiple Access Patterns\n"
        output += "These fields are accessed inconsistently and should be standardized:\n"
        for field, var_count in sorted(high_variation, key=lambda x: x[1], reverse=True)[:5]:
            output += f"- `{field}` - {var_count} different access patterns\n"
    
    return output

def main():
    parser = argparse.ArgumentParser(description='Create visual summary of RAD data usage')
    parser.add_argument('input', help='JSON analysis report')
    parser.add_argument('-o', '--output', default='rad-data-visual-summary.md',
                       help='Output file')
    
    args = parser.parse_args()
    
    # Generate summary
    summary = create_visual_summary(args.input)
    
    with open(args.output, 'w') as f:
        f.write(summary)
    
    print(f"Visual summary saved to: {args.output}")

if __name__ == '__main__':
    main()