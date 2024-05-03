import requests, os, json
from dotenv import load_dotenv

load_dotenv()

base_url = 'https://leetcode.com/graphql/'
cookies = {
    'csrftoken': os.getenv('CSRF_TOKEN'),
    'LEETCODE_SESSION': os.getenv('LEETCODE_SESSION')
}

lang_slug_to_ace_mode = {
    'python3': 'python',
    'mssql': 'sqlserver',
    'c': 'c_cpp',
    'cpp': 'c_cpp',
}

def get_problem_data(problem_name):
    # Initialize response data
    problem_data = {
        "problem_link": f"https://leetcode.com/problems/{problem_name}",
    }
    
    # Set headers
    headers = {
        "Content-Type": "application/json",
        "Cookie": "; ".join([f"{key}={value}" for key, value in cookies.items()])
    }
    
    # Get problem information from GraphQL
    info_query = json.dumps({
        "query": """
            query questionInfo($titleSlug: String!) {
                question(titleSlug: $titleSlug) {
                    questionId
                    title
                    titleSlug
                    difficulty
                    likes
                    dislikes
                    exampleTestcaseList
                    content
                    codeSnippets {
                        lang
                        langSlug
                        code
                    }
                    envInfo
                    enableRunCode
                    metaData
                }
            }
        """,
        "variables": {
            "titleSlug": problem_name
        }
    })
    
    response = requests.post(base_url, headers=headers, data=info_query)
    if (response.status_code == 200):
        data = response.json()['data']['question']
        
        # Get problem information
        problem_data['problem_id'] = data['questionId']
        problem_data['problem_title'] = data['title']
        problem_data['problem_slug'] = data['titleSlug']
        problem_data['problem_difficulty'] = data['difficulty']
        problem_data['problem_likes'] = data['likes']
        problem_data['problem_dislikes'] = data['dislikes']
        problem_data['problem_content'] = data['content']
        problem_data['code_snippets'] = data['codeSnippets']
        problem_data['env_info'] = data['envInfo']
        
        # Add ace mode to code snippets
        for snippet in problem_data['code_snippets']:
            snippet['ace_mode'] = lang_slug_to_ace_mode.get(snippet['langSlug'], snippet['langSlug'])
        
        test_cases = data['exampleTestcaseList']
        problem_data['example_testcases_input'] = [test_case.split('\n') for test_case in test_cases]
        
        test_case_metadata = json.loads(data['metaData'])
        problem_data['params'] = [param['name'] for param in test_case_metadata['params']]
    
    return problem_data

def interpret_code(problem_slug, code_data):
    # Set headers
    headers = {
        'content-type': 'application/json',
        'x-csrftoken': os.getenv('CSRF_TOKEN'),
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/problems/' + problem_slug,
        'Cookie': "; ".join([f"{key}={value}" for key, value in cookies.items()]),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
    }
    # Post request to REST
    interpret_url = 'https://leetcode.com/problems/' + problem_slug + '/interpret_solution/'
    response = requests.post(interpret_url, headers=headers, data=json.dumps(code_data))
    
    print(response.status_code)
    if (response.status_code == 200):
        interpret_id = response.json()['interpret_id']
        
       # Return interpret_id
        return {
            "interpret_id": interpret_id
        }
    
    return {}

def check_interpret(problem_slug, id):
    # Set headers
    headers = {
        'content-type': 'application/json',
        'x-csrftoken': os.getenv('CSRF_TOKEN'),
        'Origin': 'https://leetcode.com',
        'Referer': 'https://leetcode.com/problems/' + problem_slug,
        'Cookie': "; ".join([f"{key}={value}" for key, value in cookies.items()]),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
    }
    
    # Get interpretation result (must be done in the backend because of CORS policy)
    check_url = 'https://leetcode.com/submissions/detail/' + id + '/check/'
    
    response = requests.get(check_url, headers=headers)
    try:
        data = response.json()
        if data['state'] == 'SUCCESS':
            return data
        else:
            return {}
    except:
        return {}
    
def get_problems(category="", skip=0, limit=18, filters={}):
    
    # Set headers
    headers = {
        "Content-Type": "application/json",
        "Cookie": "; ".join([f"{key}={value}" for key, value in cookies.items()])
    }
    
    # Get problem information from GraphQL
    query = json.dumps({
        "query": """
            query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
                problemsetQuestionList: questionList(
                    categorySlug: $categorySlug
                    limit: $limit
                    skip: $skip
                    filters: $filters
                ) {
                    total: totalNum
                    questions: data {
                    difficulty
                    title
                    titleSlug
                    categoryTitle
                    topicTags {
                        name
                        id
                        slug
                    }
                }
            }
        }
        """,
        "variables": {
            "categorySlug": category,
            "limit": limit,
            "skip": skip,
            "filters": filters
        }
    })
    
    response = requests.post(base_url, headers=headers, data=query)
    if (response.status_code == 200):
        return response.json()['data']['problemsetQuestionList']
    
    return {
        "total": 0,
        "questions": []
    }