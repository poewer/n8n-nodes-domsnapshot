import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

export class DOMSnapshot implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Dom Snapshot',
        name: 'domSnapshot',
        icon: { light: 'file:dss.svg', dark: 'file:dss.svg' },
        group: ['transform'],
        version: 1,
        description: 'Open a URL with Playwright, wait for load, and return HTML',
        defaults: {
            name: 'Dom Snapshot',
        },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        usableAsTool: true,
        properties: [
            {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com',
                description: 'Address of the page to open',
                required: true,
            },
            {
                displayName: 'Wait Until',
                name: 'waitUntil',
                type: 'options',
                default: 'networkidle',
                description: 'When to consider navigation succeeded',
                options: [
                    { name: 'Load', value: 'load', description: 'Wait for load event' },
                    { name: 'DOM Content Loaded', value: 'domcontentloaded', description: 'Wait for DOMContentLoaded event' },
                    { name: 'Network Idle', value: 'networkidle', description: 'Wait for network to be idle' },
                ],
            },
            {
                displayName: 'Timeout (Ms)',
                name: 'timeout',
                type: 'number',
                default: 30000,
                description: 'Maximum time to wait for the page to load',
                typeOptions: { minValue: 0 },
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();

        let playwright: any;
        try {
            playwright = await import('playwright');
        } catch (e) {
            throw new NodeOperationError(
                this.getNode(),
                'Playwright is not installed. Please run "npm install playwright" in your community node project, then install browsers with "npx playwright install" in the same environment where n8n runs.',
            );
        }

        const browser = await playwright.chromium.launch({ headless: true });

        try {
            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                try {
                    const url = this.getNodeParameter('url', itemIndex, '') as string;
                    const waitUntil = this.getNodeParameter('waitUntil', itemIndex, 'networkidle') as
                        'load' | 'domcontentloaded' | 'networkidle' | 'commit';
                    const timeout = this.getNodeParameter('timeout', itemIndex, 30000) as number;

                    if (!url) {
                        throw new NodeOperationError(this.getNode(), 'Parameter "URL" is required', { itemIndex });
                    }

                    const context = await browser.newContext();
                    const page = await context.newPage();

                    try {
                        await page.goto(url, { waitUntil, timeout });
                        const html = await page.content();

                        const item = items[itemIndex];
                        item.json.data = html;
                    } finally {
                        await page.close().catch(() => {});
                        await context.close().catch(() => {});
                    }
                } catch (error) {
                    if (this.continueOnFail()) {
                        items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex } as unknown as INodeExecutionData);
                    } else {
                        if ((error as any).context) {
                            (error as any).context.itemIndex = itemIndex;
                            throw error;
                        }
                        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
                    }
                }
            }

            return [items];
        } finally {
            await browser.close().catch(() => {});
        }
    }
}

