#!/usr/bin/env python3
"""
Comprehensive analysis of unique data fields used by RAD synthesizers
Shows exactly what data is used and how commonly it's shared
"""

import json
import argparse
from collections import defaultdict, Counter
from typing import Dict, List, Set, Tuple

class UniqueDataAnalyzer:
    def __init__(self):
        self.all_fields = defaultdict(lambda: {
            'raw_variations': set(),
            'synthesizers': set(),
            'entity_sources': set(),
            'access_patterns': set(),
            'category': '',
            'subcategory': '',
            'data_type': '',
            'description': ''
        })
        
    def normalize_field_deeply(self, field: str) -> str:
        """Deep normalization to identify truly unique data points"""
        # Remove quotes and clean
        field = field.strip().strip('"\'`')
        
        # Deep normalization mapping
        deep_mappings = {
            # Account/Identity
            'accountId': 'account.id',
            'wsbvnext.accountId': 'account.id',
            'mktgasst.accountId': 'account.id',
            'vnextAccount.shopperId': 'account.shopperId',
            
            # Entity IDs
            'id': 'entity.id',
            'wsbvnext.id': 'entity.id',
            'mktgasst.id': 'entity.id',
            
            # Entity Types
            'type': 'entity.type',
            'wsbvnext.type': 'entity.type',
            'mktgasst.type': 'entity.type',
            
            # Billing/Payment
            'vnextAccount.billing.commitment': 'billing.commitment',
            'vnextAccount.billing.termType': 'billing.termType',
            'vnextAccount.billing.autoRenew': 'billing.autoRenew',
            'vnextAccount.account.paymentStatus': 'billing.paymentStatus',
            'account.paymentStatus': 'billing.paymentStatus',
            
            # Features/Configuration
            'features.websiteType': 'website.type',
            'features.published': 'website.isPublished',
            'features.widgets': 'website.widgets',
            'features.planType': 'account.planType',
            'features.userAddedLogo': 'website.hasCustomLogo',
            'features.externalDomainName': 'website.customDomain',
            
            # Entitlements
            'entitlementData': 'entitlements.all',
            'entitlementData.current': 'entitlements.current',
            'entitlementData.current.commerce': 'entitlements.commerce',
            'entitlementData.current.blog': 'entitlements.blog',
            'entitlementData.current.appointments': 'entitlements.appointments',
            'entitlementData.current.conversations': 'entitlements.conversations',
            'entitlementData.current["conversations.lite"]': 'entitlements.conversationsLite',
            'entitlementData.transitionable': 'entitlements.available',
            'entitlementData.used': 'entitlements.used',
            
            # Social Media
            'gem.subscriberCount': 'email.subscriberCount',
            'gem.hasSent': 'email.hasSentCampaign',
            'gem.lastFbPostDate': 'social.lastFacebookPost',
            'gem.lastIgPostDate': 'social.lastInstagramPost',
            'features.facebook.pageId': 'social.facebookPageId',
            'features.facebook.isConnected': 'social.facebookConnected',
            'features.instagram.isConnected': 'social.instagramConnected',
            'features.gmb.hasGMBPublished': 'social.googleBusinessPublished',
            'features.gmb.hasGMBStarted': 'social.googleBusinessStarted',
            'features.gmb.hasGMBLocation': 'social.googleBusinessLocation',
            'features.yelp.hasYelpPublished': 'social.yelpPublished',
            'features.yelp.hasCompletedYelpFlow': 'social.yelpCompleted',
            
            # Commerce/Products
            'ols.products.count': 'commerce.productCount',
            'ols.setup_status': 'commerce.setupStatus',
            'ols.store_status': 'commerce.storeStatus',
            'ols.marketplace_data': 'commerce.marketplaces',
            'ols.featured_products_with_images': 'commerce.featuredProducts',
            'ols.payment_methods.available': 'commerce.paymentMethods',
            'ols.features_enabled.product_reviews': 'commerce.productReviewsEnabled',
            'ols.features_enabled.abandoned_cart': 'commerce.abandonedCartEnabled',
            
            # Appointments
            'ola.service.total': 'appointments.serviceCount',
            'ola.account.status': 'appointments.accountStatus',
            'ola.online_payment.status': 'appointments.paymentStatus',
            'ola.calendar_sync.status': 'appointments.calendarSyncStatus',
            'ola.facebook_booking.status': 'appointments.facebookBookingStatus',
            'ola.notifications.c1_sms': 'appointments.smsNotifications',
            'ola.account.has_business_address': 'appointments.hasBusinessAddress',
            
            # Other data
            'customerIntentions': 'customer.intentions',
            'wsbvnext.customerIntentions': 'customer.intentions',
            'blog': 'content.blogPosts',
            'contacts': 'customer.contacts',
            'domainName': 'website.domainName',
            'links.addSubscribers': 'links.emailSubscribers',
            'links.composeCampaign': 'links.emailCampaign',
            'links.blog': 'links.blog',
            'links.editorDirect': 'links.websiteEditor',
            'links.preview': 'links.websitePreview',
            
            # Request context
            'request.query.ventureId': 'context.ventureId',
            'request.query.appLocation': 'context.appLocation',
            'vnextAccount.ventureId': 'context.ventureId',
        }
        
        # Apply deep mapping
        for original, normalized in deep_mappings.items():
            if field == original:
                return normalized
                
        # If no mapping found, do basic normalization
        if field.startswith('features.'):
            return 'website.' + field[9:]
        elif field.startswith('vnextAccount.'):
            return field[13:]
        elif field.startswith('wsbvnext.'):
            return field[9:]
        elif field.startswith('mktgasst.'):
            return field[9:]
            
        return field
    
    def categorize_field(self, normalized_field: str) -> Tuple[str, str]:
        """Categorize field into main category and subcategory"""
        parts = normalized_field.split('.')
        
        if parts[0] in ['account', 'entity']:
            return 'Identity & Core Data', parts[0]
        elif parts[0] in ['billing', 'payment']:
            return 'Billing & Payments', 'billing'
        elif parts[0] == 'entitlements':
            return 'Entitlements & Permissions', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] == 'website':
            return 'Website Configuration', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] in ['email', 'social']:
            return 'Marketing & Social', parts[0]
        elif parts[0] == 'commerce':
            return 'E-commerce', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] == 'appointments':
            return 'Appointments & Services', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] == 'customer':
            return 'Customer Data', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] == 'links':
            return 'Navigation Links', parts[1] if len(parts) > 1 else 'general'
        elif parts[0] == 'context':
            return 'Request Context', parts[1] if len(parts) > 1 else 'general'
        else:
            return 'Other', 'uncategorized'
    
    def get_data_type(self, field: str) -> str:
        """Infer data type from field name"""
        if any(x in field for x in ['Count', 'total', 'number']):
            return 'number'
        elif any(x in field for x in ['Date', 'date', 'Time', 'time']):
            return 'datetime'
        elif any(x in field for x in ['is', 'has', 'Enabled', 'Connected', 'Published']):
            return 'boolean'
        elif any(x in field for x in ['Status', 'status', 'Type', 'type']):
            return 'enum'
        elif any(x in field for x in ['Id', 'id', 'ID']):
            return 'identifier'
        elif any(x in field for x in ['widgets', 'data', 'intentions']):
            return 'array/object'
        else:
            return 'string'
    
    def generate_description(self, field: str, category: str) -> str:
        """Generate human-readable description"""
        descriptions = {
            # Identity
            'account.id': 'Unique identifier for the customer account',
            'entity.id': 'Unique identifier for the entity (context-dependent)',
            'entity.type': 'Type of entity (wsbvnext, mktgasst, etc.)',
            'account.shopperId': 'GoDaddy shopper ID for the account',
            'account.planType': 'Current subscription plan type',
            
            # Billing
            'billing.commitment': 'Billing commitment period (monthly, annual, etc.)',
            'billing.termType': 'Billing term type',
            'billing.autoRenew': 'Whether auto-renewal is enabled',
            'billing.paymentStatus': 'Current payment status',
            
            # Website
            'website.type': 'Type of website builder (gocentral, etc.)',
            'website.isPublished': 'Whether the website is published and live',
            'website.widgets': 'List of enabled website widgets/sections',
            'website.hasCustomLogo': 'Whether user has uploaded a custom logo',
            'website.customDomain': 'Custom domain name if configured',
            'website.domainName': 'Primary domain name for the website',
            
            # Entitlements
            'entitlements.all': 'Complete entitlement information',
            'entitlements.current': 'Currently active entitlements',
            'entitlements.commerce': 'E-commerce feature entitlement',
            'entitlements.blog': 'Blog feature entitlement',
            'entitlements.appointments': 'Appointments feature entitlement',
            'entitlements.conversations': 'Chat/conversations entitlement',
            'entitlements.available': 'Entitlements available for upgrade',
            
            # Marketing
            'email.subscriberCount': 'Number of email subscribers',
            'email.hasSentCampaign': 'Whether any email campaign has been sent',
            'social.lastFacebookPost': 'Date of most recent Facebook post',
            'social.lastInstagramPost': 'Date of most recent Instagram post',
            'social.facebookPageId': 'Connected Facebook page ID',
            'social.facebookConnected': 'Whether Facebook is connected',
            'social.instagramConnected': 'Whether Instagram is connected',
            'social.googleBusinessPublished': 'Whether Google Business profile is published',
            'social.yelpPublished': 'Whether Yelp listing is published',
            
            # Commerce
            'commerce.productCount': 'Number of products in online store',
            'commerce.setupStatus': 'Store setup completion status',
            'commerce.storeStatus': 'Current store operational status',
            'commerce.marketplaces': 'Connected marketplace information',
            'commerce.paymentMethods': 'Available payment methods',
            'commerce.productReviewsEnabled': 'Whether product reviews are enabled',
            'commerce.abandonedCartEnabled': 'Whether abandoned cart recovery is enabled',
            
            # Appointments
            'appointments.serviceCount': 'Number of bookable services',
            'appointments.accountStatus': 'Appointment system account status',
            'appointments.paymentStatus': 'Online payment setup status',
            'appointments.calendarSyncStatus': 'Calendar synchronization status',
            'appointments.facebookBookingStatus': 'Facebook appointment booking status',
            
            # Customer
            'customer.intentions': 'Customer intent/goal information',
            'customer.contacts': 'Customer contact list information',
            
            # Context
            'context.ventureId': 'Current venture/project ID',
            'context.appLocation': 'Current application location/view',
        }
        
        return descriptions.get(field, f'{category} data field')
    
    def analyze_report(self, report_path: str):
        """Analyze the JSON report and extract all unique data fields"""
        with open(report_path, 'r') as f:
            report = json.load(f)
        
        # Process each synthesizer
        for synth in report['synthesizer_details']:
            synth_name = synth['name']
            
            for field_access in synth['field_accesses']:
                raw_field = field_access['field']
                normalized = self.normalize_field_deeply(field_access['normalized'])
                entity_type = field_access['entity_type']
                access_method = field_access['access_method']
                
                # Update field information
                self.all_fields[normalized]['raw_variations'].add(raw_field)
                self.all_fields[normalized]['synthesizers'].add(synth_name)
                self.all_fields[normalized]['entity_sources'].add(entity_type)
                self.all_fields[normalized]['access_patterns'].add(access_method)
                
                # Set category and description if not set
                if not self.all_fields[normalized]['category']:
                    category, subcategory = self.categorize_field(normalized)
                    self.all_fields[normalized]['category'] = category
                    self.all_fields[normalized]['subcategory'] = subcategory
                    self.all_fields[normalized]['data_type'] = self.get_data_type(normalized)
                    self.all_fields[normalized]['description'] = self.generate_description(normalized, category)
    
    def generate_unique_data_report(self) -> str:
        """Generate comprehensive report of all unique data"""
        output = "# Complete Unique Data Fields Used by RAD Synthesizers\n\n"
        
        # Summary statistics
        total_unique = len(self.all_fields)
        output += f"## Summary\n\n"
        output += f"- **Total Unique Data Fields:** {total_unique}\n"
        output += f"- **Total Synthesizers:** {len(set().union(*[f['synthesizers'] for f in self.all_fields.values()]))}\n\n"
        
        # Most commonly used data
        output += "## Top 20 Most Commonly Used Data\n\n"
        sorted_fields = sorted(self.all_fields.items(), 
                             key=lambda x: len(x[1]['synthesizers']), 
                             reverse=True)
        
        output += "| Data Field | Used By | Category | Type | Description |\n"
        output += "|------------|---------|----------|------|-------------|\n"
        
        for field, info in sorted_fields[:20]:
            count = len(info['synthesizers'])
            output += f"| `{field}` | {count} RADs | {info['category']} | {info['data_type']} | {info['description']} |\n"
        
        output += "\n"
        
        # Group by category
        categories = defaultdict(list)
        for field, info in self.all_fields.items():
            categories[info['category']].append((field, info))
        
        # Sort categories by total usage
        category_usage = {}
        for cat, fields in categories.items():
            total_usage = sum(len(info['synthesizers']) for _, info in fields)
            category_usage[cat] = total_usage
        
        sorted_categories = sorted(categories.items(), 
                                 key=lambda x: category_usage[x[0]], 
                                 reverse=True)
        
        # Output by category
        for category, fields in sorted_categories:
            output += f"## {category}\n\n"
            
            # Sort fields within category by usage
            sorted_cat_fields = sorted(fields, 
                                     key=lambda x: len(x[1]['synthesizers']), 
                                     reverse=True)
            
            output += f"**{len(fields)} unique data fields** used by synthesizers:\n\n"
            
            for field, info in sorted_cat_fields:
                synth_count = len(info['synthesizers'])
                var_count = len(info['raw_variations'])
                
                output += f"### `{field}`\n"
                output += f"- **Description:** {info['description']}\n"
                output += f"- **Data Type:** {info['data_type']}\n"
                output += f"- **Used by:** {synth_count} synthesizers\n"
                
                if var_count > 1:
                    output += f"- **Access Variations:** {var_count} different ways\n"
                    if var_count <= 5:
                        for var in sorted(info['raw_variations']):
                            output += f"  - `{var}`\n"
                
                if synth_count <= 5:
                    output += f"- **Used in:**\n"
                    for synth in sorted(info['synthesizers']):
                        output += f"  - {synth}\n"
                
                output += "\n"
        
        return output
    
    def generate_data_overlap_matrix(self) -> str:
        """Generate matrix showing which synthesizers share common data needs"""
        output = "\n# Data Overlap Analysis\n\n"
        
        # Find synthesizers that use similar sets of data
        synth_data_sets = {}
        for synth in set().union(*[f['synthesizers'] for f in self.all_fields.values()]):
            synth_fields = set()
            for field, info in self.all_fields.items():
                if synth in info['synthesizers']:
                    synth_fields.add(field)
            synth_data_sets[synth] = synth_fields
        
        # Find synthesizers with high overlap
        overlaps = []
        synth_list = list(synth_data_sets.keys())
        
        for i in range(len(synth_list)):
            for j in range(i + 1, len(synth_list)):
                synth1 = synth_list[i]
                synth2 = synth_list[j]
                
                fields1 = synth_data_sets[synth1]
                fields2 = synth_data_sets[synth2]
                
                if fields1 and fields2:
                    overlap = len(fields1 & fields2)
                    total = len(fields1 | fields2)
                    
                    if overlap >= 3:  # At least 3 fields in common
                        similarity = overlap / total
                        overlaps.append({
                            'synth1': synth1,
                            'synth2': synth2,
                            'common_fields': overlap,
                            'similarity': similarity,
                            'shared_data': sorted(fields1 & fields2)
                        })
        
        # Sort by similarity
        overlaps.sort(key=lambda x: x['similarity'], reverse=True)
        
        output += "## Synthesizers with Similar Data Requirements\n\n"
        output += "Top synthesizer pairs that share significant data requirements:\n\n"
        
        for overlap in overlaps[:20]:
            output += f"### {overlap['synth1']} ↔ {overlap['synth2']}\n"
            output += f"- **Similarity:** {overlap['similarity']:.1%}\n"
            output += f"- **Common Fields:** {overlap['common_fields']}\n"
            output += f"- **Shared Data:**\n"
            for field in overlap['shared_data'][:5]:
                output += f"  - `{field}`\n"
            if len(overlap['shared_data']) > 5:
                output += f"  - ... and {len(overlap['shared_data']) - 5} more\n"
            output += "\n"
        
        return output
    
    def generate_csv_summary(self) -> str:
        """Generate CSV for spreadsheet analysis"""
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Normalized Field',
            'Category',
            'Subcategory',
            'Data Type',
            'Description',
            'Used By Count',
            'Variation Count',
            'Entity Sources',
            'Example Raw Fields'
        ])
        
        # Sort by usage
        sorted_fields = sorted(self.all_fields.items(), 
                             key=lambda x: len(x[1]['synthesizers']), 
                             reverse=True)
        
        # Data rows
        for field, info in sorted_fields:
            example_variations = list(info['raw_variations'])[:3]
            writer.writerow([
                field,
                info['category'],
                info['subcategory'],
                info['data_type'],
                info['description'],
                len(info['synthesizers']),
                len(info['raw_variations']),
                ', '.join(sorted(info['entity_sources'])),
                ' | '.join(example_variations)
            ])
        
        return output.getvalue()

def main():
    parser = argparse.ArgumentParser(description='Analyze unique data fields in RAD synthesizers')
    parser.add_argument('input', help='JSON analysis report from analyze_rad_fields.py')
    parser.add_argument('-o', '--output-base', default='unique-data-fields',
                       help='Base name for output files')
    
    args = parser.parse_args()
    
    # Analyze
    analyzer = UniqueDataAnalyzer()
    analyzer.analyze_report(args.input)
    
    # Generate reports
    print("Generating unique data fields report...")
    
    # Main report
    report = analyzer.generate_unique_data_report()
    report += analyzer.generate_data_overlap_matrix()
    
    with open(f"{args.output_base}.md", 'w') as f:
        f.write(report)
    print(f"Report saved to: {args.output_base}.md")
    
    # CSV summary
    csv_data = analyzer.generate_csv_summary()
    with open(f"{args.output_base}.csv", 'w') as f:
        f.write(csv_data)
    print(f"CSV summary saved to: {args.output_base}.csv")
    
    # Summary stats
    print(f"\nAnalysis complete!")
    print(f"Total unique data fields: {len(analyzer.all_fields)}")
    
    # Show category breakdown
    categories = defaultdict(int)
    for info in analyzer.all_fields.values():
        categories[info['category']] += 1
    
    print("\nData fields by category:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {cat}: {count}")

if __name__ == '__main__':
    main()