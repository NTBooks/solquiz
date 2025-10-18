# Quiz to Certificate Demo

A simple Express.js demo application that presents a three-question mathematics quiz and generates/uploads certificates to the blockchain when users achieve a perfect score.

## Features

- **Simple Quiz Interface**: Three multiple-choice math questions
- **Dynamic Certificate Generation**: Creates personalized certificates using Sharp
- **Blockchain Integration**: Uploads certificates to "Course Complete" collection
- **Real-time Status Checking**: Monitor certificate upload and stamping status
- **Clean UI**: Simple, responsive design with clear feedback

## How It Works

1. **Quiz Presentation**: User enters their name and answers three math questions
2. **Perfect Score Check**: Only users with 100% correct answers proceed
3. **Certificate Generation**: Creates a personalized certificate with name and date
4. **Collection Creation**: Creates "Course Complete" collection via API
5. **File Upload**: Uploads the certificate to the blockchain
6. **Status Monitoring**: Shows real-time file status and stamping progress

## Installation

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment variables**:

   ```bash
   cp env.example .env
   # Edit .env with your API credentials
   ```

3. **Start the server**:

   ```bash
   npm start
   ```

4. **Access the application**:
   Open http://localhost:3002 in your browser

## Environment Variables

Create a `.env` file with the following variables:

```env
# API credentials for the Chainletter webhook
API_KEY=your-api-key-here
API_SECRET=your-api-secret-here
API_NETWORK=public

# Server configuration
PORT=3002
```

## API Integration

The demo integrates with the Chainletter Credential Server Webhook API:

- **POST** `/webhook/{apikey}` - Creates collection and uploads certificate
- **GET** `/webhook/{apikey}` - Retrieves file status and information

## File Structure

```
simple_example_2_quiz_to_cert/
├── server.js          # Express server with quiz logic and API integration
├── index.html         # Quiz interface
├── complete.html      # Certificate completion page
├── package.json       # Dependencies
├── env.example        # Environment variables template
└── README.md         # This file
```

## Dependencies

- **express**: Web framework
- **sharp**: Image processing for certificate generation
- **axios**: HTTP client for API calls
- **form-data**: File upload handling
- **dotenv**: Environment variable management

## Quiz Questions

The demo includes three simple addition questions:

1. What is 5 + 3? (Answer: 8)
2. What is 12 + 7? (Answer: 19)
3. What is 25 + 15? (Answer: 40)

## Certificate Features

- **Personalized**: Includes user's name and current date
- **Professional Design**: Clean SVG template with proper styling
- **Unique ID**: Each certificate has a timestamp-based ID
- **High Quality**: Generated as PNG using Sharp

## Usage Flow

1. **Start Quiz**: Enter name and begin answering questions
2. **Submit Answers**: All questions must be answered
3. **Perfect Score**: Only 100% correct answers generate certificates
4. **Certificate Generation**: Personalized certificate created with Sharp
5. **Upload Process**: Certificate uploaded to "Course Complete" collection
6. **Status Page**: View certificate details and blockchain status
7. **Refresh Status**: Check stamping progress and transaction details

## Error Handling

- **API Failures**: Graceful handling of network and authentication errors
- **File Upload Issues**: Clear error messages for upload problems
- **Status Check Failures**: Fallback display when status unavailable
- **Invalid Input**: Form validation for name and answers

## Security Notes

- API credentials stored in environment variables
- No sensitive data stored in browser
- Server-side certificate generation
- Proper error handling without exposing internals

## Customization

To modify the demo:

1. **Change Questions**: Edit the `quizQuestions` array in `server.js`
2. **Update Certificate**: Modify the SVG template in `generateCertificate()`
3. **Change Collection Name**: Update `collectionName` variable
4. **Add Features**: Extend the API integration or UI components

## Troubleshooting

- **Port Conflicts**: Change PORT in .env if 3002 is in use
- **API Errors**: Verify credentials and network connectivity
- **Sharp Issues**: Ensure proper image processing dependencies
- **File Upload Failures**: Check API endpoint and credentials

This demo showcases a complete workflow from user interaction to blockchain storage, making it an excellent example for understanding webhook API integration.
