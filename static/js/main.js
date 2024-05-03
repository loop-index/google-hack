function card_template(data) {
    var result = `
    <div class="col-2">
        <div class="card h-100">
            <div class="card-body">
                <h5 class="card-title">${data['title']}</h5>
                <h6 class="card-subtitle mb-2 text-body-secondary"><span class="badge bg-dark-subtle text-${data['difficulty'] == 'Easy' ? 'success' : data['difficulty'] == 'Medium' ? 'warning' : 'danger'}">${data['difficulty']}</span> in ${data['categoryTitle']}</h6>`;

    for (let i = 0; i < data['topicTags'].length; i++) {
        result += `<span class="badge bg-secondary text-dark me-1">${data['topicTags'][i]['name']}</span>`;
    }

    result += `
                <br>
                <a href="/problem/${data['titleSlug']}" class="card-link btn btn-sm btn-warning mt-2">Start</a>
            </div>
        </div>
    </div>
    `;

    return result;
}

function setup() {   
    // Populate questions
    for (let i = 0; i < problem_list['questions'].length; i++) {
        $("#questions-container").append(card_template(problem_list['questions'][i]));
    }

    // Pagination
    $("#page-select").empty();
    for (let i = 0; i < Math.ceil(problem_list['total'] / 18); i++){
        $("#page-select").append(`
            <option value="${i + 1}">${i + 1}</option>
        `);
    }
}

function search(page=0) {
    var search_text = $("#search-input").val().toLowerCase();
    var difficulty = $("#difficulty-select").val() == 'Filter by difficulty' ? null : $("#difficulty-select").val();
    var category = $("#category-input").val() || '';
    var tags = $("#tag-input").val().split(" ");

    var filters = {};
    if (difficulty) {
        filters['difficulty'] = difficulty;
    }

    if (tags.length > 0) {
        filters['tags'] = tags;
    }

    if (search_text) {
        filters['searchKeywords'] = search_text;
    }

    var payload = {
        'skip': page * 18,
        'category': category,
        'filters': filters
    }

    fetch('/problems', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(response => response.json())
    .then(data => {
        console.log(data);
        $("#questions-container").empty();
        for (let i = 0; i < data['questions'].length; i++) {
            $("#questions-container").append(card_template(data['questions'][i]));
        }

        // Pagination
        $("#page-select").empty();
        for (let i = 0; i < Math.ceil(data['total'] / 18); i++){
            $("#page-select").append(`
                <option value="${i + 1}">${i + 1}</option>
            `);
        }
    });
}

$(document).ready(function() {
    setup();

    // Hover effect on cards
    $("#questions-container").on("mouseover", ".card", function() {
        $(this).addClass("border border-warning border-2");
    });

    $("#questions-container").on("mouseout", ".card:not(.active-card)", function() {
        $(this).removeClass("border border-warning border-2");
    });

    $("#questions-container").on("click", ".card", function() {
        // Remove previous active card
        $(".active-card").removeClass("active-card border border-warning border-2");

        // Add active card
        $(this).addClass("active-card border border-warning border-2");
    });

    $("#questions-container").on("click", ".active-card", function() {
        $(this).removeClass("active-card border border-warning border-2");
    });

    // Search functionality
    $("#search-btn").click(search);

    // Clear filters
    $("#clear-btn").click(function() {
        $("#search-input").val('');
        $("#difficulty-select").val('Filter by difficulty');
        $("#category-input").val('');
        $("#tag-input").val('');
        $("#questions-container").empty();
        
        setup();
    });

    // Pagination
    $("#page-select").change(function() {
        search(parseInt($(this).val()) - 1);
    });
});