export class AppError extends Error {
    type: string = ''

    constructor(message: string, type?: string) {
        super(message)
        this.type = type ?? ''
    }

    static getMessageFromAny(error: any): string {
        if (error instanceof AppError) {
            return error.message
        } else if (error instanceof Error) {
            return error.message
        } else if (typeof error === 'string') {
            return error
        }
        return "Unknown error"
    }
}
